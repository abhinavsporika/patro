// src/components/LanguageSelector.tsx
import React from 'react';
import { ALL_LANGUAGES, LANGUAGE_META, SupportedLanguage } from '../lib/transpiler';

interface Props {
  selected: SupportedLanguage;
  onSelect: (lang: SupportedLanguage) => void;
}

export const LanguageSelector: React.FC<Props> = ({ selected, onSelect }) => {
  return (
    <div className="grid grid-cols-6 gap-2">
      {ALL_LANGUAGES.map((lang) => {
        const meta = LANGUAGE_META[lang];
        const isActive = lang === selected;
        return (
          <button
            key={lang}
            onClick={() => onSelect(lang)}
            className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg text-xs font-medium transition-all ${
              isActive
                ? 'bg-gray-700 text-white ring-1 ring-cyan-500 shadow-lg shadow-cyan-500/10'
                : 'bg-gray-900 text-gray-500 hover:text-gray-300 hover:bg-gray-800'
            }`}
            title={meta.label}
          >
            <span
              className="text-base leading-none"
              style={{ color: isActive ? meta.color : undefined }}
            >
              {meta.icon}
            </span>
            <span className={`truncate w-full text-center ${isActive ? 'text-white' : ''}`}>
              {meta.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
