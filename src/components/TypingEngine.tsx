// src/components/TypingEngine.tsx
// Typing engine with 5 editor themes, ghost racing, and auto-indentation.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useKeystrokeCapture } from '../hooks/useKeystrokeCapture';
import { GhostRaceBar, GhostStatsBar, GhostLevelSelector, GhostLevel, GHOST_LEVELS } from './GhostCursor';
import { getPersonalBest, submitRunResult, GhostData, Pattern } from '../lib/api';
import { highlightCode } from '../lib/syntax-highlight';
import { EditorTheme, EditorThemeId, EDITOR_THEMES, THEME_ORDER } from '../lib/editor-themes';
import { SupportedLanguage, LANGUAGE_EXTENSIONS, LANGUAGE_META } from '../lib/transpiler';

interface Props {
  pattern: Pattern;
  language: SupportedLanguage;
  runProgress?: { current: number; total: number };
  onRunComplete: (newDifficulty: number) => void;
}

function generateTargetPace(contentLength: number, targetWpm: number): GhostData {
  const charsPerMin = targetWpm * 5;
  const msPerChar = 60000 / charsPerMin;
  const timestamps: number[] = [];
  for (let i = 0; i < contentLength; i++) {
    timestamps.push(Math.round(msPerChar * (i + 1)));
  }
  return { timestamps, wpm: targetWpm, accuracy: 1.0 };
}

// ── Difficulty rank badge ──
function getDifficultyRank(diff: number): { label: string; color: string } {
  if (diff <= 0.20) return { label: 'Fundamentals', color: 'text-gray-400 bg-gray-800/60 border-gray-700' };
  if (diff <= 0.35) return { label: 'Easy', color: 'text-green-400 bg-green-950/40 border-green-800/60' };
  if (diff <= 0.55) return { label: 'Medium', color: 'text-amber-400 bg-amber-950/40 border-amber-800/60' };
  if (diff <= 0.75) return { label: 'Hard', color: 'text-orange-400 bg-orange-950/40 border-orange-800/60' };
  return { label: 'Expert', color: 'text-red-400 bg-red-950/40 border-red-800/60' };
}

// ── Helper: get current line & col from input length ──
function getCursorPos(content: string, inputLen: number): { line: number; col: number } {
  const lines = content.split('\n');
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineEnd = pos + lines[i].length + 1;
    if (inputLen < lineEnd) return { line: i + 1, col: inputLen - pos + 1 };
    pos = lineEnd;
  }
  return { line: lines.length, col: 1 };
}

// ── Line Data ──
interface LineData {
  text: string;
  startIdx: number;
  lineNum: number;
}

function parseLines(content: string): LineData[] {
  const raw = content.split('\n');
  const lines: LineData[] = [];
  let idx = 0;
  for (let i = 0; i < raw.length; i++) {
    lines.push({ text: raw[i], startIdx: idx, lineNum: i + 1 });
    idx += raw[i].length + 1;
  }
  return lines;
}

// ── Themed Code Editor ──
interface CodeEditorProps {
  content: string;
  input: string;
  completed: boolean;
  colorClasses: string[];
  theme: EditorTheme;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ content, input, completed, colorClasses, theme }) => {
  const lines = useMemo(() => parseLines(content), [content]);
  const totalLines = lines.length;

  let cursorLine = 0;
  {
    for (let i = 0; i < lines.length; i++) {
      const lineEnd = lines[i].startIdx + lines[i].text.length;
      if (input.length <= lineEnd) { cursorLine = i; break; }
      if (input.length === lineEnd + 1 && i < lines.length - 1) { cursorLine = i + 1; break; }
      if (i === lines.length - 1) cursorLine = i;
    }
  }

  const lineNumWidth = String(totalLines).length;

  return (
    <div className="font-mono text-sm leading-6 select-none">
      {lines.map((line, lineIdx) => {
        const isCurrentLine = lineIdx === cursorLine && !completed;

        return (
          <div
            key={lineIdx}
            className={`flex transition-colors duration-75 ${isCurrentLine ? theme.currentLineCls : ''}`}
          >
            {/* Gutter */}
            {theme.showGutter && (
              <div
                className={`flex-shrink-0 text-right pr-4 select-none mr-4 ${theme.gutterBorderCls} ${
                  isCurrentLine ? theme.gutterActiveCls : theme.gutterInactiveCls
                }`}
                style={{ width: `${Math.max(lineNumWidth, 2) * 0.75 + 1.5}rem` }}
              >
                {line.lineNum}
              </div>
            )}

            {/* Indent for terminal (no gutter but need left padding) */}
            {!theme.showGutter && (
              <div className="flex-shrink-0 w-4" />
            )}

            {/* Line content */}
            <div className="flex-1 whitespace-pre relative">
              {line.text.split('').map((char, charIdx) => {
                const globalIdx = line.startIdx + charIdx;
                const isTyped = globalIdx < input.length;
                const isCorrect = isTyped && input[globalIdx] === char;
                const isError = isTyped && input[globalIdx] !== char;
                const isCursorHere = globalIdx === input.length && !completed;

                let className = '';
                if (isCorrect) {
                  className = theme.typedCorrectCls;
                } else if (isError) {
                  className = theme.typedErrorCls;
                } else {
                  // Untyped
                  className = theme.useSyntax
                    ? (colorClasses[globalIdx] || theme.monoUntyped || 'text-gray-700')
                    : theme.monoUntyped;
                }

                return (
                  <span key={charIdx} className="relative">
                    <span className={className}>
                      {char === ' ' && isError ? '\u00B7' : char}
                    </span>
                    {isCursorHere && (
                      theme.cursorType === 'block' ? (
                        <span className={`absolute left-0 top-0 h-full w-[0.6em] ${theme.cursorCls} opacity-60 cursor-blink`} />
                      ) : (
                        <span className={`absolute left-0 top-0 h-full w-[2px] ${theme.cursorCls} cursor-blink`} />
                      )
                    )}
                  </span>
                );
              })}

              {/* Cursor on empty lines */}
              {line.text.length === 0 && line.startIdx === input.length && !completed && (
                <span className="relative">
                  {theme.cursorType === 'block' ? (
                    <span className={`absolute left-0 top-0 h-full w-[0.6em] ${theme.cursorCls} opacity-60 cursor-blink`} />
                  ) : (
                    <span className={`absolute left-0 top-0 h-full w-[2px] ${theme.cursorCls} cursor-blink`} />
                  )}
                  <span className="opacity-0">{'\u00A0'}</span>
                </span>
              )}

              {/* Cursor after last char before newline */}
              {line.startIdx + line.text.length === input.length && line.text.length > 0 && !completed && (
                <span className="relative inline-block w-0">
                  {theme.cursorType === 'block' ? (
                    <span className={`absolute left-0 top-0 h-full w-[0.6em] ${theme.cursorCls} opacity-60 cursor-blink`} />
                  ) : (
                    <span className={`absolute left-0 top-0 h-full w-[2px] ${theme.cursorCls} cursor-blink`} />
                  )}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* Vim tilde rows for empty space */}
      {theme.emptyLineChar && (() => {
        const extraRows = Math.max(0, 5 - lines.length);
        return Array.from({ length: extraRows }).map((_, i) => (
          <div key={`empty-${i}`} className="flex">
            {theme.showGutter && (
              <div
                className={`flex-shrink-0 text-right pr-4 select-none mr-4 ${theme.gutterBorderCls} text-blue-600/50`}
                style={{ width: `${Math.max(lineNumWidth, 2) * 0.75 + 1.5}rem` }}
              >
                {theme.emptyLineChar}
              </div>
            )}
            <div className="flex-1">&nbsp;</div>
          </div>
        ));
      })()}
    </div>
  );
};

// ── Theme Dropdown Selector ──
const ThemeSelector: React.FC<{ current: EditorThemeId; onChange: (t: EditorThemeId) => void }> = ({ current, onChange }) => {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentTheme = EDITOR_THEMES[current];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(prev => !prev)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-sans font-medium text-gray-400 hover:text-gray-200 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600 transition-colors"
      >
        <span className="text-gray-500 font-mono text-[10px]">{currentTheme.icon}</span>
        <span>{currentTheme.label}</span>
        <svg
          className={`w-3 h-3 text-gray-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 min-w-[160px] rounded-lg border border-gray-700 bg-gray-900 shadow-xl overflow-hidden animate-fade-in">
          {THEME_ORDER.map(tid => {
            const t = EDITOR_THEMES[tid];
            const active = current === tid;
            return (
              <button
                key={tid}
                onClick={() => { onChange(tid); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] font-sans transition-colors ${
                  active
                    ? 'bg-gray-800 text-white font-medium'
                    : 'text-gray-400 hover:bg-gray-800/70 hover:text-white'
                }`}
              >
                <span className="font-mono text-[10px] text-gray-500 w-5 text-center">{t.icon}</span>
                <span>{t.label}</span>
                {active && (
                  <svg className="w-3 h-3 text-cyan-400 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Title Bars per theme ──
interface TitleBarProps {
  theme: EditorTheme;
  domain: string;
  lineCount: number;
  wpm: number;
  accuracy: number;
  completed: boolean;
  won: boolean;
  isRunning: boolean;
  fileExtension: string;
}

const EditorTitleBar: React.FC<TitleBarProps> = ({ theme, domain, lineCount, wpm, accuracy, completed, won, isRunning, fileExtension }) => {
  const winBg = won ? 'bg-green-950/30' : 'bg-amber-950/30';
  const winBorder = won ? 'border-green-800' : 'border-amber-800';
  const baseBg = completed ? winBg : theme.titleBg;
  const baseBorder = completed ? winBorder : theme.titleBorder;

  if (theme.id === 'terminal') {
    return (
      <div className={`flex items-center justify-between px-4 py-2 border-b ${baseBg} ${baseBorder}`}>
        <div className="flex items-center gap-2">
          <span className="text-green-500 font-mono text-[11px]">user@patro</span>
          <span className="text-gray-600 font-mono text-[11px]">:</span>
          <span className="text-blue-400 font-mono text-[11px]">~/{domain}</span>
          <span className="text-gray-600 font-mono text-[11px]">$</span>
          <span className="text-green-700 font-mono text-[11px]">cat snippet{fileExtension}</span>
        </div>
        <div className="flex gap-4 text-[11px] font-mono text-green-700/60">
          <span>{Math.round(wpm)} wpm</span>
          <span>{accuracy}%</span>
        </div>
      </div>
    );
  }

  if (theme.id === 'vim') {
    // Vim has no title bar chrome — just minimal filename
    return (
      <div className={`flex items-center justify-between px-4 py-1.5 border-b ${baseBg} ${baseBorder}`}>
        <span className="text-[11px] text-gray-500 font-mono">
          "{domain}_snippet{fileExtension}" {lineCount}L
        </span>
        <div className="flex gap-4 text-[11px] font-mono text-gray-600">
          <span>{Math.round(wpm)} wpm</span>
          <span>{accuracy}% acc</span>
        </div>
      </div>
    );
  }

  if (theme.id === 'leetcode') {
    return (
      <div className={`flex items-center justify-between px-4 py-2 border-b ${baseBg} ${baseBorder}`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center">
            <span className="px-3 py-1 text-[11px] font-medium text-gray-700 bg-white border-b-2 border-blue-500">
              {domain}{fileExtension}
            </span>
          </div>
          <span className="text-[10px] text-gray-400">{lineCount} lines</span>
        </div>
        <div className="flex gap-4 text-[11px] text-gray-500">
          <span>WPM: <b className="text-blue-600 font-mono">{Math.round(wpm)}</b></span>
          <span>Acc: <b className="text-green-600 font-mono">{accuracy}%</b></span>
        </div>
      </div>
    );
  }

  // IDE (default)
  return (
    <div className={`flex items-center justify-between px-4 py-2 border-b ${baseBg} ${baseBorder}`}>
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5 mr-3">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
        </div>
        <span className="text-[11px] text-gray-500 font-mono">{domain}{fileExtension}</span>
        <span className="text-[10px] text-gray-700 font-mono ml-2">{lineCount} lines</span>
      </div>
      <div className="flex gap-4 text-[11px] uppercase tracking-widest text-gray-500">
        <span>WPM: <b className="text-cyan-400 font-mono">{Math.round(wpm)}</b></span>
        <span>Acc: <b className="text-purple-400 font-mono">{accuracy}%</b></span>
      </div>
    </div>
  );
};

// ── Status Bars per theme ──
interface StatusBarProps {
  theme: EditorTheme;
  cursorPos: { line: number; col: number };
  charCount: number;
  domain: string;
  isRunning: boolean;
  completed: boolean;
  won: boolean;
  inputLen: number;
  languageLabel: string;
}

const EditorStatusBar: React.FC<StatusBarProps> = ({ theme, cursorPos, charCount, domain, isRunning, completed, won, inputLen, languageLabel }) => {
  const winBg = won ? 'bg-green-950/20' : 'bg-amber-950/20';
  const winBorder = won ? 'border-green-800' : 'border-amber-800';
  const winText = won ? 'text-green-600' : 'text-amber-600';
  const bg = completed ? winBg : theme.statusBg;
  const border = completed ? winBorder : theme.statusBorder;
  const text = completed ? winText : theme.statusText;

  if (theme.id === 'terminal') {
    return (
      <div className={`flex items-center justify-between px-4 py-1 text-[10px] font-mono border-t ${bg} ${border} ${text}`}>
        <span className="text-green-800/50">
          [{cursorPos.line}:{cursorPos.col}] {charCount} chars
        </span>
        <div className="flex items-center gap-3">
          {isRunning && <span className="text-green-600">|</span>}
          {completed && <span className={won ? 'text-green-400' : 'text-amber-400'}>EXIT {won ? '0' : '1'}</span>}
        </div>
      </div>
    );
  }

  if (theme.id === 'vim') {
    return (
      <div className={`flex items-center justify-between px-4 py-0.5 text-[10px] font-mono border-t ${bg} ${border} ${text}`}>
        <div>
          {!isRunning && !completed && inputLen === 0 && (
            <span className="text-gray-400">-- NORMAL --</span>
          )}
          {isRunning && (
            <span className="text-green-400 font-bold">-- INSERT --</span>
          )}
          {completed && (
            <span className={won ? 'text-green-400' : 'text-amber-400'}>
              {won ? '-- COMPLETE --' : '-- DONE --'}
            </span>
          )}
        </div>
        <span className="text-gray-600">
          {cursorPos.line},{cursorPos.col}&nbsp;&nbsp;&nbsp;&nbsp;All
        </span>
      </div>
    );
  }

  if (theme.id === 'leetcode') {
    return (
      <div className={`flex items-center justify-between px-4 py-1 text-[10px] font-mono border-t ${bg} ${border} ${text}`}>
        <div className="flex items-center gap-3">
          <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
          <span className="text-gray-300">|</span>
          <span>{charCount} characters</span>
        </div>
        <div className="flex items-center gap-3">
          <span>{languageLabel}</span>
          {isRunning && <span className="text-blue-500">Typing...</span>}
          {completed && <span className={won ? 'text-green-500' : 'text-amber-500'}>{won ? 'Accepted' : 'Try Again'}</span>}
        </div>
      </div>
    );
  }

  // IDE
  return (
    <div className={`flex items-center justify-between px-4 py-1 text-[10px] font-mono border-t ${bg} ${border} ${text}`}>
      <div className="flex items-center gap-4">
        <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
        <span>{charCount} chars</span>
      </div>
      <div className="flex items-center gap-4">
        <span>UTF-8</span>
        <span className="uppercase">{domain}</span>
        {isRunning && <span className="text-cyan-600">typing...</span>}
        {completed && <span className={won ? 'text-green-400' : 'text-amber-400'}>complete</span>}
      </div>
    </div>
  );
};

// ── Main Typing Engine ──

export const TypingEngine: React.FC<Props> = ({ pattern, language, runProgress, onRunComplete }) => {
  const [ghostLevel, setGhostLevel] = useState<GhostLevel>('intermediate');
  const [editorTheme, setEditorTheme] = useState<EditorThemeId>(() => {
    try {
      const stored = localStorage.getItem('patro_editor_theme') as string;
      return (stored && stored in EDITOR_THEMES) ? (stored as EditorThemeId) : 'ide';
    } catch { return 'ide'; }
  });
  const [ghostData, setGhostData] = useState<GhostData | null>(null);
  const [pbData, setPbData] = useState<GhostData | null>(null);
  const [completed, setCompleted] = useState(false);
  const [raceResult, setRaceResult] = useState<{
    won: boolean; userWpm: number; ghostWpm: number; deltaMs: number;
  } | null>(null);

  const theme = EDITOR_THEMES[editorTheme];
  const hasPB = pbData !== null;

  // Map theme → syntax palette
  const paletteName = editorTheme === 'leetcode' ? 'light'
    : editorTheme === 'vim' ? 'vim'
    : 'dark';
  const colorClasses = useMemo(() => highlightCode(pattern.content, paletteName), [pattern.content, paletteName]);

  // Load PB
  useEffect(() => {
    setCompleted(false);
    setPbData(null);
    setGhostData(null);
    setRaceResult(null);
    getPersonalBest(pattern.id).then(g => { if (g) setPbData(g); }).catch(() => {});
  }, [pattern.id]);

  // Build ghost data from level
  useEffect(() => {
    if (ghostLevel === 'pb') {
      setGhostData(pbData || generateTargetPace(pattern.content.length, GHOST_LEVELS['intermediate'].wpm));
    } else {
      setGhostData(generateTargetPace(pattern.content.length, GHOST_LEVELS[ghostLevel].wpm));
    }
  }, [ghostLevel, pbData, pattern.content.length]);

  useEffect(() => {
    if (pbData && ghostLevel === 'pb') setGhostData(pbData);
  }, [pbData, ghostLevel]);

  const handleComplete = useCallback(async (stats: { wpm: number; accuracy: number; timingMap: number[] }) => {
    setCompleted(true);
    if (ghostData) {
      const userTime = stats.timingMap[stats.timingMap.length - 1] || 0;
      const ghostTime = ghostData.timestamps[ghostData.timestamps.length - 1] || 0;
      setRaceResult({
        won: userTime <= ghostTime,
        userWpm: stats.wpm,
        ghostWpm: ghostData.wpm,
        deltaMs: ghostTime - userTime,
      });
    }
    try {
      const result = await submitRunResult({
        pattern_id: pattern.id, domain: pattern.domain,
        wpm: stats.wpm, accuracy: stats.accuracy,
        character_timestamps: stats.timingMap,
      });
      setTimeout(() => onRunComplete(result.new_difficulty), 2000);
    } catch {
      setTimeout(() => onRunComplete(pattern.difficulty), 2000);
    }
  }, [pattern, onRunComplete, ghostData]);

  const { input, errors, wpm, startTime, reset } = useKeystrokeCapture(pattern.content, handleComplete);
  useEffect(() => { reset(); }, [pattern.id, reset]);

  // Full session abort — called when anything external changes
  const abortSession = useCallback(() => {
    reset();
    setCompleted(false);
    setRaceResult(null);
  }, [reset]);

  // Persist theme selection + abort active session
  const handleThemeChange = useCallback((t: EditorThemeId) => {
    setEditorTheme(t);
    abortSession();
    try { localStorage.setItem('patro_editor_theme', t); } catch {}
  }, [abortSession]);

  // Hide mouse cursor while typing, reveal on mouse move
  useEffect(() => {
    const hideCursor = () => { document.body.classList.add('cursor-hidden'); };
    const showCursor = () => { document.body.classList.remove('cursor-hidden'); };
    window.addEventListener('keydown', hideCursor);
    window.addEventListener('mousemove', showCursor);
    return () => {
      window.removeEventListener('keydown', hideCursor);
      window.removeEventListener('mousemove', showCursor);
      document.body.classList.remove('cursor-hidden');
    };
  }, []);

  const isRunning = input.length > 0 && input.length < pattern.content.length;
  const userElapsed = startTime ? Date.now() - startTime : 0;
  const losingToGhost = ghostData && ghostData.timestamps[input.length]
    ? userElapsed > ghostData.timestamps[input.length] : false;
  const liveAccuracy = input.length > 0
    ? Math.round(((input.length - errors) / input.length) * 100) : 100;

  const levelMeta = GHOST_LEVELS[ghostLevel];
  const ghostLabelStr = ghostLevel === 'pb' ? 'Personal Best' : `${levelMeta.label} (${levelMeta.wpm} wpm)`;
  const lineCount = pattern.content.split('\n').length;
  const cursorPos = getCursorPos(pattern.content, input.length);
  const won = raceResult?.won ?? false;
  const fileExtension = LANGUAGE_EXTENSIONS[language] || '.py';
  const languageLabel = LANGUAGE_META[language]?.label || 'Python';

  const ghostProps = ghostData ? {
    patternContent: pattern.content,
    characterTimestamps: ghostData.timestamps,
    isActive: isRunning,
    userIndex: input.length,
    userElapsed,
    ghostWpm: ghostData.wpm,
    ghostLevel,
  } : null;

  // Dynamic border based on state
  const borderCls = completed
    ? (won ? theme.borderWinClass : theme.borderLoseClass)
    : losingToGhost ? theme.borderLosingClass : theme.borderClass;

  // Dynamic code bg
  const codeBgCls = completed
    ? (won ? theme.codeBgWin : theme.codeBgLose)
    : losingToGhost ? theme.codeBgLosing : theme.codeBg;

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header row */}
      <div className="flex items-center justify-between text-xs font-sans">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-md bg-gray-800/80 text-gray-300 font-medium capitalize border border-gray-700/50">
            {pattern.domain.replace(/_/g, ' ')}
          </span>
          {(() => {
            const rank = getDifficultyRank(pattern.difficulty);
            return (
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${rank.color}`}>
                {rank.label}
              </span>
            );
          })()}
          {runProgress && runProgress.total > 1 && (
            <span className="text-[10px] text-gray-600 font-mono tabular-nums">
              {runProgress.current}/{runProgress.total}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {ghostData && (
            <span className={`text-[10px] uppercase tracking-wider font-semibold ${levelMeta.color}`}>
              vs {ghostLabelStr}
            </span>
          )}
          {completed && raceResult && (
            <span className={`font-semibold animate-fade-in ${won ? 'text-green-400' : 'text-amber-400'}`}>
              {won ? (ghostLevel === 'pb' ? 'NEW PB!' : 'You win!') : 'Ghost wins!'}
            </span>
          )}
        </div>
      </div>

      {/* Ghost + Theme selectors */}
      <div className="flex items-center justify-between font-sans">
        <GhostLevelSelector current={ghostLevel} hasPB={hasPB} onChange={(lvl) => { setGhostLevel(lvl); abortSession(); }} />
        <ThemeSelector current={editorTheme} onChange={handleThemeChange} />
      </div>

      {/* Race bar */}
      {ghostProps && <GhostRaceBar {...ghostProps} />}

      {/* Editor */}
      <div className={`rounded-xl border shadow-2xl overflow-hidden transition-colors ${borderCls}`}>
        <EditorTitleBar
          theme={theme}
          domain={pattern.domain}
          lineCount={lineCount}
          wpm={wpm}
          accuracy={liveAccuracy}
          completed={completed}
          won={won}
          isRunning={isRunning}
          fileExtension={fileExtension}
        />

        <div className={`py-4 px-2 overflow-x-auto transition-colors ${codeBgCls} min-h-[40vh]`}>
          <CodeEditor
            content={pattern.content}
            input={input}
            completed={completed}
            colorClasses={colorClasses}
            theme={theme}
          />
        </div>

        <EditorStatusBar
          theme={theme}
          cursorPos={cursorPos}
          charCount={pattern.content.length}
          domain={pattern.domain}
          isRunning={isRunning}
          completed={completed}
          won={won}
          inputLen={input.length}
          languageLabel={languageLabel}
        />
      </div>

      {/* Ghost stats bar */}
      {ghostProps && <GhostStatsBar {...ghostProps} />}

      {/* Race result card */}
      {completed && raceResult && (
        <div className={`p-4 rounded-lg border text-sm animate-fade-in ${
          won ? 'bg-green-950/20 border-green-800' : 'bg-gray-900 border-gray-700'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className={`text-2xl font-mono ${won ? 'text-green-400' : 'text-red-400'}`}>
                {won ? '>' : '<'}
              </span>
              <div>
                <div className={`font-semibold ${won ? 'text-green-400' : 'text-gray-400'}`}>
                  {won
                    ? (ghostLevel === 'pb' ? 'New Personal Best!' : `Beat the ${levelMeta.label} ghost!`)
                    : (ghostLevel === 'pb' ? 'PB ghost wins this round' : `${levelMeta.label} ghost wins`)}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {Math.abs(raceResult.deltaMs) < 100
                    ? 'Photo finish!'
                    : `${(Math.abs(raceResult.deltaMs) / 1000).toFixed(1)}s ${won ? 'faster' : 'slower'}`}
                </div>
              </div>
            </div>
            <div className="flex gap-6 text-xs">
              <div className="text-center">
                <div className="text-gray-500 uppercase tracking-wider text-[10px]">You</div>
                <div className="text-white font-bold text-lg">{Math.round(raceResult.userWpm)}</div>
                <div className="text-gray-600 text-[10px]">wpm</div>
              </div>
              <div className="text-center">
                <div className={`uppercase tracking-wider text-[10px] ${levelMeta.color}`}>
                  {ghostLevel === 'pb' ? 'PB' : levelMeta.label}
                </div>
                <div className={`font-bold text-lg ${levelMeta.color}`}>{Math.round(raceResult.ghostWpm)}</div>
                <div className="text-gray-600 text-[10px]">wpm</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Start prompt */}
      {!isRunning && !completed && input.length === 0 && ghostData && (
        <div className="text-center text-xs text-gray-600 animate-pulse">
          Start typing to race the {ghostLevel === 'pb' ? 'personal best' : levelMeta.label.toLowerCase()} ghost...
        </div>
      )}

      {/* Restart button */}
      {(isRunning || completed) && (
        <div className="flex justify-center">
          <button
            onClick={abortSession}
            className={`group flex items-center gap-2 px-5 py-2 rounded-lg font-sans text-xs font-medium uppercase tracking-widest transition-all duration-200 border ${
              completed
                ? 'bg-red-950/40 border-red-800 text-red-400 hover:bg-red-900/60 hover:border-red-600 hover:text-red-300 hover:shadow-lg hover:shadow-red-900/30'
                : 'bg-red-950/20 border-red-900/50 text-red-500/70 hover:bg-red-950/40 hover:border-red-800 hover:text-red-400 hover:shadow-lg hover:shadow-red-900/20'
            }`}
          >
            <span className="text-base group-hover:rotate-[-180deg] transition-transform duration-300">{'↺'}</span>
            <span>{completed ? 'Restart' : 'Abort & Reset'}</span>
            <span className="text-[9px] text-red-700 group-hover:text-red-500 ml-1">[ESC]</span>
          </button>
        </div>
      )}

      {/* Progress bar */}
      <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-100 rounded-full ${
            completed ? (won ? 'bg-green-400' : 'bg-amber-400') :
            losingToGhost ? 'bg-red-400' : 'bg-cyan-400'
          }`}
          style={{ width: `${(input.length / pattern.content.length) * 100}%` }}
        />
      </div>
    </div>
  );
};
