// src/components/CustomRunBuilder.tsx
// Pick patterns from all available (seed + imported) to create a custom typing run.

import React, { useState, useEffect, useMemo } from 'react';
import { getAllPatterns, getAllDomains, Pattern } from '../lib/api';

interface Props {
  visible: boolean;
  onStartRun: (patterns: Pattern[]) => void;
}

export const CustomRunBuilder: React.FC<Props> = ({ visible, onStartRun }) => {
  const [allPatterns, setAllPatterns] = useState<Pattern[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterDomain, setFilterDomain] = useState<string>('all');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [domains, setDomains] = useState<{ builtIn: string[]; imported: string[] }>({ builtIn: [], imported: [] });

  useEffect(() => {
    if (visible) {
      getAllPatterns().then(setAllPatterns);
      getAllDomains().then(setDomains);
    }
  }, [visible]);

  // Filtered patterns
  const filtered = useMemo(() => {
    return allPatterns.filter(p => {
      if (filterDomain !== 'all' && p.domain !== filterDomain) return false;
      if (filterDifficulty === 'easy' && p.difficulty > 0.35) return false;
      if (filterDifficulty === 'medium' && (p.difficulty < 0.35 || p.difficulty > 0.65)) return false;
      if (filterDifficulty === 'hard' && p.difficulty < 0.65) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.content.toLowerCase().includes(q) || p.domain.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
      }
      return true;
    });
  }, [allPatterns, filterDomain, filterDifficulty, search]);

  const togglePattern = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (filtered.every(p => selected.has(p.id))) {
      // Deselect all visible
      setSelected(prev => {
        const next = new Set(prev);
        filtered.forEach(p => next.delete(p.id));
        return next;
      });
    } else {
      // Select all visible
      setSelected(prev => {
        const next = new Set(prev);
        filtered.forEach(p => next.add(p.id));
        return next;
      });
    }
  };

  const handleStart = () => {
    const selectedPatterns = allPatterns.filter(p => selected.has(p.id));
    if (selectedPatterns.length > 0) {
      onStartRun(selectedPatterns);
      setSelected(new Set());
    }
  };

  const allDomains = [...domains.builtIn, ...domains.imported];
  const allVisible = filtered.length > 0 && filtered.every(p => selected.has(p.id));
  const someVisible = filtered.some(p => selected.has(p.id));

  if (!visible) return null;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Build Custom Run</h3>
        <span className="text-xs text-gray-600">{allPatterns.length} patterns available</span>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search patterns..."
          className="flex-1 min-w-[160px] px-2.5 py-1.5 rounded-lg text-xs bg-gray-900 border border-gray-700
            text-gray-200 placeholder-gray-600
            focus:outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600/30"
        />

        {/* Domain filter */}
        <select
          value={filterDomain}
          onChange={(e) => setFilterDomain(e.target.value)}
          className="px-2 py-1.5 rounded-lg text-xs bg-gray-900 border border-gray-700 text-gray-300
            focus:outline-none focus:border-cyan-600"
        >
          <option value="all">All domains</option>
          <optgroup label="Built-in">
            {domains.builtIn.map(d => <option key={d} value={d}>{d}</option>)}
          </optgroup>
          {domains.imported.length > 0 && (
            <optgroup label="Personal">
              {domains.imported.map(d => <option key={d} value={d}>{d}</option>)}
            </optgroup>
          )}
        </select>

        {/* Difficulty filter */}
        <select
          value={filterDifficulty}
          onChange={(e) => setFilterDifficulty(e.target.value)}
          className="px-2 py-1.5 rounded-lg text-xs bg-gray-900 border border-gray-700 text-gray-300
            focus:outline-none focus:border-cyan-600"
        >
          <option value="all">All difficulty</option>
          <option value="easy">Easy (0-35%)</option>
          <option value="medium">Medium (35-65%)</option>
          <option value="hard">Hard (65%+)</option>
        </select>
      </div>

      {/* Selection toolbar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleAll}
            className="text-[10px] text-gray-500 hover:text-cyan-400 transition-colors"
          >
            {allVisible ? 'Deselect all' : someVisible ? 'Select all visible' : 'Select all'}
          </button>
          <span className="text-[10px] text-gray-600">
            {filtered.length} shown
          </span>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={() => setSelected(new Set())}
              className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
            >
              Clear
            </button>
          )}
          <span className={`text-xs font-medium ${selected.size > 0 ? 'text-cyan-400' : 'text-gray-600'}`}>
            {selected.size} selected
          </span>
        </div>
      </div>

      {/* Pattern list */}
      <div className="border border-gray-800 rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-600 text-xs">
            No patterns match your filters.
          </div>
        ) : (
          filtered.map(p => {
            const isSelected = selected.has(p.id);
            return (
              <div
                key={p.id}
                onClick={() => togglePattern(p.id)}
                className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer border-b border-gray-800/50 last:border-0 transition-colors ${
                  isSelected
                    ? 'bg-cyan-950/20 hover:bg-cyan-950/30'
                    : 'hover:bg-gray-800/40'
                }`}
              >
                {/* Checkbox */}
                <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  isSelected
                    ? 'border-cyan-500 bg-cyan-500'
                    : 'border-gray-600 hover:border-gray-500'
                }`}>
                  {isSelected && <span className="text-[10px] text-black font-bold">~</span>}
                </div>

                {/* Pattern content */}
                <div className="flex-1 min-w-0">
                  <pre className="text-[11px] text-gray-400 font-mono overflow-hidden whitespace-pre-wrap leading-tight max-h-12">
                    {p.content.slice(0, 100)}{p.content.length > 100 ? '...' : ''}
                  </pre>
                  <div className="flex gap-3 mt-1">
                    <span className="text-[10px] text-cyan-700 font-mono">{p.domain}</span>
                    <span className="text-[10px] text-gray-600">diff: {(p.difficulty * 100).toFixed(0)}%</span>
                    <span className="text-[10px] text-gray-700">{p.content.split('\n').length} lines</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Start Run button */}
      <div className="flex gap-2">
        <button
          onClick={handleStart}
          disabled={selected.size === 0}
          className="flex-1 px-4 py-3 rounded-lg text-sm font-semibold transition-all
            bg-cyan-600 hover:bg-cyan-500 text-white
            disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-cyan-600"
        >
          {selected.size > 0
            ? `Start Run with ${selected.size} Pattern${selected.size !== 1 ? 's' : ''}`
            : 'Select patterns to start'}
        </button>
      </div>
    </div>
  );
};
