// src/components/StreamerHUD.tsx
// Streamer Mode overlay — minimal, distraction-free HUD for live-stream use.
// Shows live WPM, accuracy, ghost race status, and domain in a compact bar.

import React, { useState, useEffect } from 'react';
import { getStats, UserStats } from '../lib/api';

interface Props {
  visible: boolean;
  liveWpm: number;
  liveAccuracy: number;
  currentDomain: string;
  difficulty: number;
  ghostWpm: number | null;
  isLosingToGhost: boolean;
  patternProgress: { current: number; total: number };
}

export const StreamerHUD: React.FC<Props> = ({
  visible,
  liveWpm,
  liveAccuracy,
  currentDomain,
  difficulty,
  ghostWpm,
  isLosingToGhost,
  patternProgress,
}) => {
  const [sessionStats, setSessionStats] = useState<UserStats | null>(null);

  // Fetch session stats periodically
  useEffect(() => {
    if (!visible) return;
    const fetch = () => getStats().then(setSessionStats).catch(() => {});
    fetch();
    const interval = setInterval(fetch, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, [visible]);

  if (!visible) return null;

  const accPct = Math.round(liveAccuracy * 100);

  return (
    <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none animate-fade-in">
      {/* Top streamer bar */}
      <div className="flex items-center justify-between px-6 py-2 bg-black/80 backdrop-blur-sm border-b border-gray-800/50">
        {/* Left: branding + domain */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-bold tracking-tight text-white">
            patro<span className="text-cyan-400">_</span>lite
          </span>
          <div className="h-4 w-px bg-gray-700" />
          <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">
            {currentDomain}
          </span>
          <span className="text-[10px] text-gray-600">
            diff {(difficulty * 100).toFixed(0)}%
          </span>
        </div>

        {/* Center: Live WPM (big) */}
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className={`text-2xl font-bold tabular-nums ${
              liveWpm > 80 ? 'text-green-400' :
              liveWpm > 50 ? 'text-cyan-400' :
              'text-yellow-400'
            }`}>
              {Math.round(liveWpm)}
            </div>
            <div className="text-[9px] text-gray-500 uppercase tracking-widest">WPM</div>
          </div>

          <div className="text-center">
            <div className={`text-lg font-bold tabular-nums ${
              accPct >= 95 ? 'text-green-400' :
              accPct >= 85 ? 'text-purple-400' :
              'text-red-400'
            }`}>
              {accPct}%
            </div>
            <div className="text-[9px] text-gray-500 uppercase tracking-widest">ACC</div>
          </div>

          {/* Ghost race indicator */}
          {ghostWpm !== null && (
            <div className="text-center">
              <div className={`text-sm font-bold ${
                isLosingToGhost ? 'text-red-400 animate-pulse' : 'text-cyan-400'
              }`}>
                {isLosingToGhost ? '👻 BEHIND' : '🏃 AHEAD'}
              </div>
              <div className="text-[9px] text-gray-500">
                PB: {Math.round(ghostWpm)} WPM
              </div>
            </div>
          )}
        </div>

        {/* Right: session stats + progress */}
        <div className="flex items-center gap-4">
          {sessionStats && (
            <div className="flex gap-3 text-xs text-gray-500">
              <span>
                runs: <b className="text-gray-300">{sessionStats.total_runs}</b>
              </span>
              <span>
                best: <b className="text-green-400">{Math.round(sessionStats.best_wpm)}</b>
              </span>
            </div>
          )}
          <div className="flex gap-1">
            {Array.from({ length: patternProgress.total }, (_, i) => (
              <div
                key={i}
                className={`w-4 h-1 rounded-full ${
                  i < patternProgress.current ? 'bg-cyan-400' :
                  i === patternProgress.current ? 'bg-white' :
                  'bg-gray-700'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
