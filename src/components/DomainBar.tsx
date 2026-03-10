// src/components/DomainBar.tsx
// Horizontal domain selector bar — language-world-aware with personal patterns dropdown.

import React, { useState, useRef, useCallback } from 'react';
import { isTranspilable } from '../lib/transpiler';
import { deleteCategory } from '../lib/api';
import { useClickOutside } from '../hooks/useClickOutside';
import type { SupportedLanguage } from '../lib/transpiler';
import type { DomainMeta } from '../lib/language-worlds';

interface Props {
  domain: string;
  setDomain: (d: string) => void;
  language: SupportedLanguage;
  isCustomRun: boolean;
  setIsCustomRun: (v: boolean) => void;
  currentIndex: number;
  patternsLength: number;
  domains: { builtIn: string[]; imported: string[] };
  languageDomains: DomainMeta[];
  loadPatterns: (domain: string, lang?: SupportedLanguage) => void;
  refreshDomains: () => void;
  setView: (v: string) => void;
}

const formatDomain = (d: string) =>
  d === 'default' ? 'All' : d.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export const DomainBar: React.FC<Props> = ({
  domain, setDomain, language, isCustomRun, setIsCustomRun,
  currentIndex, patternsLength, domains, languageDomains,
  loadPatterns, refreshDomains, setView,
}) => {
  const [personalDropdownOpen, setPersonalDropdownOpen] = useState(false);
  const personalDropdownRef = useRef<HTMLDivElement>(null);

  const closeDropdown = useCallback(() => setPersonalDropdownOpen(false), []);
  useClickOutside(personalDropdownRef, closeDropdown);

  const isImportedDomain = domains.imported.includes(domain);

  return (
    <div className="flex gap-1.5 flex-wrap items-center">
      {(languageDomains.length > 0 || isTranspilable(language)) && (
        <>
          <button
            onClick={() => { setDomain('default'); setIsCustomRun(false); }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
              domain === 'default' && !isCustomRun
                ? 'bg-cyan-950/40 text-cyan-300 border-cyan-800/60'
                : 'text-gray-500 border-transparent hover:text-gray-300 hover:border-gray-700'
            }`}
          >
            All
          </button>
          {languageDomains.length > 0 ? (
            languageDomains.map(d => (
              <button
                key={d.key}
                onClick={() => { setDomain(d.key); setIsCustomRun(false); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                  domain === d.key && !isCustomRun
                    ? `bg-gray-800/60 ${d.color} border-current/30`
                    : 'text-gray-500 border-transparent hover:text-gray-300 hover:border-gray-700'
                }`}
                title={d.description}
              >
                <span className="mr-1 font-mono text-[10px] opacity-60">{d.icon}</span>
                {d.label}
              </button>
            ))
          ) : (
            domains.builtIn.map(d => (
              <button
                key={d}
                onClick={() => { setDomain(d); setIsCustomRun(false); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                  domain === d && !isCustomRun
                    ? 'bg-cyan-950/40 text-cyan-300 border-cyan-800/60'
                    : 'text-gray-500 border-transparent hover:text-gray-300 hover:border-gray-700'
                }`}
              >
                {formatDomain(d)}
              </button>
            ))
          )}
        </>
      )}

      {/* Personal Patterns dropdown */}
      {isTranspilable(language) && domains.imported.length > 0 && (
        <>
          <div className="h-4 w-px bg-gray-700 mx-1" />
          <div className="relative" ref={personalDropdownRef}>
            <button
              onClick={() => setPersonalDropdownOpen(prev => !prev)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                isImportedDomain && !isCustomRun
                  ? 'bg-cyan-950/40 text-cyan-300 border-cyan-800/60'
                  : 'text-cyan-500 border-cyan-900/40 hover:text-cyan-400 hover:border-cyan-700'
              }`}
            >
              {isImportedDomain ? formatDomain(domain) : 'Personal'}
              <svg
                className={`w-3 h-3 text-cyan-600 transition-transform duration-200 ${personalDropdownOpen ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-900/50 text-cyan-400 font-mono">
                {domains.imported.length}
              </span>
            </button>

            {personalDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] rounded-lg border border-gray-700 bg-gray-900 shadow-xl overflow-hidden animate-fade-in">
                <div className="px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider border-b border-gray-800 font-medium">
                  Personal Patterns
                </div>
                {domains.imported.map(d => (
                  <div
                    key={d}
                    className="flex items-center justify-between group hover:bg-gray-800/70 transition-colors"
                  >
                    <button
                      onClick={() => {
                        setDomain(d);
                        setIsCustomRun(false);
                        setPersonalDropdownOpen(false);
                      }}
                      className={`flex-1 text-left px-3 py-2 text-xs font-medium transition-colors ${
                        domain === d ? 'text-cyan-300' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {domain === d && (
                        <svg className="w-3 h-3 text-cyan-400 inline mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      {formatDomain(d)}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteCategory(d);
                        if (domain === d) setDomain('default');
                        refreshDomains();
                        loadPatterns(domain === d ? 'default' : domain, language);
                      }}
                      className="px-2 py-2 text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      title={`Delete ${d}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
                <div className="border-t border-gray-800">
                  <button
                    onClick={() => { setView('import'); setPersonalDropdownOpen(false); }}
                    className="w-full text-left px-3 py-2 text-[11px] text-gray-500 hover:text-cyan-400 hover:bg-gray-800/50 transition-colors font-medium"
                  >
                    + Import more...
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Custom run indicator */}
      {isCustomRun && (
        <>
          <div className="h-4 w-px bg-gray-700 mx-1" />
          <span className="text-[10px] text-amber-400 uppercase tracking-wider font-semibold animate-pulse">
            Custom Run ({currentIndex + 1}/{patternsLength})
          </span>
          <button
            onClick={() => { setIsCustomRun(false); loadPatterns(domain, language); }}
            className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors font-medium"
          >
            exit
          </button>
        </>
      )}
    </div>
  );
};
