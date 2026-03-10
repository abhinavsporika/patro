// src/components/GhostCursor.tsx
// Interactive ghost: race bar (top) + stats bar (bottom), split for layout flexibility.

import React from 'react';
import { useGhost } from '../hooks/useGhost';

export type GhostLevel = 'beginner' | 'intermediate' | 'expert' | 'god' | 'pb';

export const GHOST_LEVELS: Record<GhostLevel, { label: string; wpm: number; color: string; icon: string }> = {
  beginner:     { label: 'Beginner',     wpm: 30,  color: 'text-green-400',  icon: '~' },
  intermediate: { label: 'Intermediate', wpm: 55,  color: 'text-amber-400',  icon: '>' },
  expert:       { label: 'Expert',       wpm: 85,  color: 'text-orange-400', icon: '>>' },
  god:          { label: 'God',          wpm: 130, color: 'text-red-400',    icon: '!!!' },
  pb:           { label: 'Personal Best', wpm: 0,  color: 'text-cyan-400',   icon: '*' },
};

interface SharedProps {
  patternContent: string;
  characterTimestamps: number[];
  isActive: boolean;
  userIndex: number;
  userElapsed: number;
  ghostWpm: number;
  ghostLevel: GhostLevel;
}

// ── Race Bar (goes above the code snippet) ──

export const GhostRaceBar: React.FC<SharedProps> = (props) => {
  const { patternContent, characterTimestamps, isActive, userIndex, userElapsed, ghostWpm, ghostLevel } = props;
  const { ghostIndex, delta } = useGhost({ characterTimestamps, isActive, userIndex, userElapsed });

  const totalLen = patternContent.length;
  const ghostProgress = totalLen > 0 ? (ghostIndex / totalLen) * 100 : 0;
  const userProgress = totalLen > 0 ? (userIndex / totalLen) * 100 : 0;

  const absDelta = Math.abs(delta);
  const isAhead = delta > 0;
  const deltaStr = absDelta < 100 ? 'neck & neck' :
    `${(absDelta / 1000).toFixed(1)}s ${isAhead ? 'ahead' : 'behind'}`;

  const preRace = !isActive && userIndex === 0;
  const levelMeta = GHOST_LEVELS[ghostLevel];
  const ghostLabel = ghostLevel === 'pb' ? 'PB' : levelMeta.label.slice(0, 3).toUpperCase();

  return (
    <div className="relative h-7 rounded-lg bg-gray-800/80 overflow-hidden border border-gray-700/50">
      {/* Ghost progress track */}
      <div
        className="absolute top-0 left-0 h-full bg-cyan-900/30 transition-all duration-75"
        style={{ width: `${ghostProgress}%` }}
      />
      {/* User progress track */}
      <div
        className={`absolute top-0 left-0 h-full transition-all duration-75 ${
          isAhead ? 'bg-green-900/30' : 'bg-red-900/20'
        }`}
        style={{ width: `${userProgress}%` }}
      />

      {/* Ghost marker */}
      <div
        className="absolute top-0 h-full w-0.5 bg-cyan-400/60 transition-all duration-75"
        style={{ left: `${Math.min(ghostProgress, 99)}%` }}
      >
        <div className={`absolute -top-0 -translate-x-1/2 px-1 text-[8px] font-mono bg-gray-900/90 rounded-b border border-gray-700 border-t-0 whitespace-nowrap ${levelMeta.color}`}>
          {ghostLabel}
        </div>
      </div>

      {/* User marker */}
      <div
        className={`absolute top-0 h-full w-0.5 transition-all duration-75 ${isAhead ? 'bg-green-400' : 'bg-white'}`}
        style={{ left: `${Math.min(userProgress, 99)}%` }}
      >
        <div className={`absolute bottom-0 -translate-x-1/2 px-1 text-[8px] font-mono bg-gray-900/90 rounded-t border border-gray-700 border-b-0 whitespace-nowrap ${isAhead ? 'text-green-400' : 'text-white'}`}>
          YOU
        </div>
      </div>

      {/* Center delta */}
      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono">
        {preRace ? (
          <span className="text-gray-500">ready to race</span>
        ) : (
          <span className={`font-semibold ${isAhead ? 'text-green-400' : absDelta < 100 ? 'text-gray-400' : 'text-red-400'}`}>
            {deltaStr}
          </span>
        )}
      </div>
    </div>
  );
};

// ── Ghost Stats Bar (goes below the code snippet) ──

export const GhostStatsBar: React.FC<SharedProps> = (props) => {
  const { characterTimestamps, isActive, userIndex, userElapsed, ghostWpm, ghostLevel } = props;
  const { ghostIndex, ghostDone, ghostLiveWpm } = useGhost({ characterTimestamps, isActive, userIndex, userElapsed });

  const levelMeta = GHOST_LEVELS[ghostLevel];
  const isPb = ghostLevel === 'pb';

  return (
    <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-gray-800/40 border border-gray-800/60 text-[10px] font-mono">
      {/* Left: ghost info */}
      <div className="flex items-center gap-4">
        <span className={`font-semibold uppercase tracking-wider ${levelMeta.color}`}>
          {levelMeta.icon} {isPb ? 'Personal Best' : levelMeta.label}
        </span>
        <span className="text-gray-500">
          {isPb ? 'PB' : 'Ghost'}: <b className={levelMeta.color}>{Math.round(ghostWpm)}</b> wpm
        </span>
        {ghostLiveWpm > 0 && isActive && (
          <span className="text-gray-600">
            live: {Math.round(ghostLiveWpm)} wpm
          </span>
        )}
      </div>

      {/* Right: status */}
      <div className="flex items-center gap-3">
        {isActive && !ghostDone && (
          <span className="text-gray-600">
            ghost: {ghostIndex} chars
          </span>
        )}
        {ghostDone && isActive && (
          <span className="text-green-400 font-semibold">Ghost finished - keep going!</span>
        )}
        {ghostDone && !isActive && userIndex === 0 && (
          <span className="text-gray-600">ghost replay ready</span>
        )}
      </div>
    </div>
  );
};

// ── Ghost Level Selector ──

interface LevelSelectorProps {
  current: GhostLevel;
  hasPB: boolean;
  onChange: (level: GhostLevel) => void;
}

export const GhostLevelSelector: React.FC<LevelSelectorProps> = ({ current, hasPB, onChange }) => {
  const levels: GhostLevel[] = hasPB
    ? ['beginner', 'intermediate', 'expert', 'god', 'pb']
    : ['beginner', 'intermediate', 'expert', 'god'];

  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-gray-600 uppercase tracking-wider mr-1">Ghost:</span>
      {levels.map(lvl => {
        const meta = GHOST_LEVELS[lvl];
        const isActive = current === lvl;
        return (
          <button
            key={lvl}
            onClick={() => onChange(lvl)}
            className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
              isActive
                ? `bg-gray-700 ${meta.color} font-semibold`
                : 'text-gray-600 hover:text-gray-400'
            }`}
            title={`${meta.label} (${lvl === 'pb' ? 'your best' : meta.wpm + ' wpm'})`}
          >
            {lvl === 'pb' ? 'PB' : meta.label}
          </button>
        );
      })}
    </div>
  );
};
