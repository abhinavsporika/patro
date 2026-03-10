// src/components/PatternContextCard.tsx
// Collapsible card showing pattern context: name, description, when to use, why it matters.

import React, { useState } from 'react';
import type { Pattern } from '../lib/api';
import { LANGUAGE_WORLDS, type DomainMeta } from '../lib/language-worlds';
import type { SupportedLanguage } from '../lib/transpiler';

interface Props {
  pattern: Pattern;
  language: SupportedLanguage;
}

export const PatternContextCard: React.FC<Props> = ({ pattern, language }) => {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('patro_context_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  // No metadata available — don't render
  if (!pattern.patternName && !pattern.description) return null;

  const world = LANGUAGE_WORLDS[language];
  const domainMeta: DomainMeta | undefined = world?.domains.find(d => d.key === pattern.domain);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('patro_context_collapsed', String(next)); } catch {}
  };

  return (
    <div className="rounded-lg border border-gray-800/60 bg-gray-900/50 overflow-hidden transition-all">
      {/* Header — always visible */}
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-800/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          {domainMeta && (
            <span className={`text-xs font-mono ${domainMeta.color} opacity-80`}>
              {domainMeta.icon}
            </span>
          )}
          <span className="text-sm font-semibold text-white">
            {pattern.patternName || pattern.domain.replace(/_/g, ' ')}
          </span>
          {domainMeta && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-gray-800 ${domainMeta.color} font-medium`}>
              {domainMeta.label}
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Body — collapsible */}
      {!collapsed && (
        <div className="px-4 pb-3 space-y-2 border-t border-gray-800/40">
          {pattern.description && (
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">{pattern.description}</p>
          )}
          <div className="flex flex-col sm:flex-row gap-3 text-[11px]">
            {pattern.whenToUse && (
              <div className="flex-1">
                <span className="text-gray-600 uppercase tracking-wider font-medium">When to use</span>
                <p className="text-gray-400 mt-0.5 leading-relaxed">{pattern.whenToUse}</p>
              </div>
            )}
            {pattern.whyItMatters && (
              <div className="flex-1">
                <span className="text-gray-600 uppercase tracking-wider font-medium">Why it matters</span>
                <p className="text-gray-400 mt-0.5 leading-relaxed">{pattern.whyItMatters}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
