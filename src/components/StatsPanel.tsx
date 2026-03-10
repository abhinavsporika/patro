// src/components/StatsPanel.tsx
import React, { useState, useEffect } from 'react';
import { getStats, getDomainStats, UserStats, DomainStat } from '../lib/api';

interface Props {
  visible: boolean;
}

export const StatsPanel: React.FC<Props> = ({ visible }) => {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [domainStats, setDomainStats] = useState<DomainStat[]>([]);

  useEffect(() => {
    if (visible) {
      getStats().then(setStats).catch(() => {});
      getDomainStats().then(setDomainStats).catch(() => {});
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="space-y-4 animate-fade-in">
      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Stats</h3>

      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Runs" value={stats.total_runs} color="text-white" />
          <StatCard label="Avg WPM" value={Math.round(stats.avg_wpm)} color="text-cyan-400" />
          <StatCard label="Avg Acc" value={`${Math.round(stats.avg_accuracy * 100)}%`} color="text-purple-400" />
          <StatCard label="Best WPM" value={Math.round(stats.best_wpm)} color="text-green-400" />
        </div>
      )}

      {domainStats.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs text-gray-500 uppercase tracking-wider">By Domain</h4>
          {domainStats.map(d => (
            <div key={d.domain} className="flex items-center justify-between text-xs bg-gray-900/50 px-3 py-2 rounded-lg border border-gray-800/50">
              <span className="text-gray-300 font-mono">{d.domain}</span>
              <div className="flex gap-4 text-gray-500">
                <span>{d.run_count} runs</span>
                <span className="text-cyan-400">{Math.round(d.avg_wpm)} wpm</span>
                <span className="text-purple-400">{Math.round(d.avg_accuracy * 100)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string | number; color: string }> = ({ label, value, color }) => (
  <div className="bg-gray-900 rounded-lg p-3 text-center border border-gray-800">
    <div className={`text-xl font-bold ${color}`}>{value}</div>
    <div className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">{label}</div>
  </div>
);
