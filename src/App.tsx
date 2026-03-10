// src/App.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TypingEngine } from './components/TypingEngine';
import { CalibrationModal } from './components/CalibrationModal';
import { StatsPanel } from './components/StatsPanel';
import { WeaknessCloud } from './components/WeaknessCloud';
import { StreamerHUD } from './components/StreamerHUD';
import { IngestDropZone } from './components/IngestDropZone';
import { LanguageSelector } from './components/LanguageSelector';
import { CustomRunBuilder } from './components/CustomRunBuilder';
import { DomainBar } from './components/DomainBar';
import { getNextRun, isCalibrated, getAllDomains, Pattern } from './lib/api';
import { transpileFrom, detectSourceLang, isTranspilable, isNativeOnly, SupportedLanguage, LANGUAGE_META } from './lib/transpiler';
import { getStaticPatterns } from './lib/markup-patterns';
import { LANGUAGE_WORLDS, type DomainMeta } from './lib/language-worlds';
import { PatternContextCard } from './components/PatternContextCard';
import appIcon from './assets/app-icon.png';

type View = 'typing' | 'stats' | 'weakness' | 'import' | 'progress' | 'custom_run';

export default function App() {
  const [needsCalibration, setNeedsCalibration] = useState<boolean | null>(null);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [domain, setDomain] = useState('default');
  const [language, setLanguage] = useState<SupportedLanguage>('python');
  const [view, setView] = useState<View>('typing');
  const [loading, setLoading] = useState(false);
  const [difficulty, setDifficulty] = useState(0.25);
  const [streamerMode, setStreamerMode] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [liveWpm, setLiveWpm] = useState(0);
  const [liveAccuracy, setLiveAccuracy] = useState(1.0);
  const [ghostWpm, setGhostWpm] = useState<number | null>(null);
  const [isLosingToGhost, setIsLosingToGhost] = useState(false);
  const [domains, setDomains] = useState<{ builtIn: string[]; imported: string[] }>({ builtIn: [], imported: [] });

  // Custom run state
  const [isCustomRun, setIsCustomRun] = useState(false);

  // Load domains (built-in + imported categories)
  const refreshDomains = useCallback(async () => {
    setDomains(await getAllDomains());
  }, []);

  // Check calibration on mount + load domains
  useEffect(() => {
    isCalibrated()
      .then(cal => setNeedsCalibration(!cal))
      .catch(() => setNeedsCalibration(true));
    refreshDomains();
  }, [refreshDomains]);

  // Load patterns
  const loadPatterns = useCallback(async (dom: string, lang?: SupportedLanguage) => {
    setLoading(true);
    try {
      const p = await getNextRun(dom, 5, lang);
      setPatterns(p);
      setCurrentIndex(0);
    } catch (e) {
      console.error("Failed to load patterns:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (needsCalibration === false && !isCustomRun) {
      loadPatterns(domain, language);
    }
  }, [needsCalibration, domain, language, loadPatterns, isCustomRun]);

  const handleCalibrationComplete = useCallback(() => {
    setNeedsCalibration(false);
  }, []);

  const handleRunComplete = useCallback((newDifficulty: number) => {
    setDifficulty(newDifficulty);
    if (currentIndex < patterns.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      if (isCustomRun) {
        // Custom run finished
        setIsCustomRun(false);
      }
      loadPatterns(domain, language);
    }
  }, [currentIndex, patterns.length, domain, language, loadPatterns, isCustomRun]);

  // Toggle streamer mode with Ctrl+Shift+S
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        setStreamerMode(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Reload patterns + domains after import
  const handleIngestComplete = useCallback(() => {
    refreshDomains();
    loadPatterns(domain, language);
  }, [domain, language, loadPatterns, refreshDomains]);

  // Start a custom run with user-selected patterns
  const handleStartCustomRun = useCallback((selectedPatterns: Pattern[]) => {
    setPatterns(selectedPatterns);
    setCurrentIndex(0);
    setIsCustomRun(true);
    setView('typing');
  }, []);

  // Compute domains for current language world
  const languageDomains = useMemo((): DomainMeta[] => {
    const world = LANGUAGE_WORLDS[language];
    if (!world) return []; // fallback languages — no domain bar
    return world.domains;
  }, [language]);

  const welcomeHint = LANGUAGE_WORLDS[language]?.welcomeHint;

  // Transpile patterns for current language (must be before early returns)
  const transpiledPatterns = useMemo((): Pattern[] => {
    // Static languages use their own pattern sets
    if (!isTranspilable(language) && !isNativeOnly(language)) {
      const staticPats = getStaticPatterns(language);
      return staticPats.map((sp) => ({
        id: sp.id,
        domain: sp.domain,
        difficulty: sp.difficulty,
        content: sp.content,
        source: language,
      }));
    }

    // Native-only languages (assembly) — only show native patterns
    if (isNativeOnly(language)) {
      return patterns.filter(p => p.lang === language);
    }

    // 1. Native patterns for this language (exact match)
    const native = patterns.filter(p => p.lang === language);

    // 2. Other patterns → transpile to target language
    const foreign = patterns.filter(p => p.lang && p.lang !== language);
    const noLang = patterns.filter(p => !p.lang); // legacy patterns, assume Python

    const transpiled = [...foreign, ...noLang]
      .map(p => {
        const srcLang = p.lang || detectSourceLang(p.source);
        if (srcLang === language) return p;
        const content = transpileFrom(p.content, srcLang, language);
        if (!content) return null;
        return { ...p, content, lang: language };
      })
      .filter((p): p is Pattern => p !== null);

    // 3. If language has a native world → show native + imported transpiled
    const hasNativeWorld = !!LANGUAGE_WORLDS[language];
    if (hasNativeWorld && native.length > 0) {
      const importedTranspiled = transpiled.filter(p => p.source?.startsWith('import:'));
      return [...native, ...importedTranspiled];
    }

    // 4. No native world → use all transpiled (current fallback behavior)
    return transpiled.length > 0 ? transpiled : patterns.map(p => {
      const sourceLang = detectSourceLang(p.source);
      if (sourceLang === language) return p;
      const content = transpileFrom(p.content, sourceLang, language);
      if (!content) return p;
      return { ...p, content };
    });
  }, [patterns, language]);

  const currentPattern = transpiledPatterns[currentIndex < transpiledPatterns.length ? currentIndex : 0];

  // Show loading state
  if (needsCalibration === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 text-sm animate-pulse">Loading...</div>
      </div>
    );
  }

  // Show calibration
  if (needsCalibration) {
    return <CalibrationModal onComplete={handleCalibrationComplete} />;
  }

  const VIEW_LABELS: Record<View, string> = {
    typing: 'Train',
    stats: 'Stats',
    weakness: 'Weakness',
    progress: 'Progress',
    import: 'Import',
    custom_run: 'Custom Run',
  };

  return (
    <div className="min-h-screen flex flex-col font-sans">
      {/* Streamer Mode HUD overlay */}
      <StreamerHUD
        visible={streamerMode}
        liveWpm={liveWpm}
        liveAccuracy={liveAccuracy}
        currentDomain={domain}
        difficulty={difficulty}
        ghostWpm={ghostWpm}
        isLosingToGhost={isLosingToGhost}
        patternProgress={{ current: currentIndex, total: patterns.length }}
      />

      {/* Header */}
      <header className={`border-b border-gray-800/50 px-4 sm:px-6 lg:px-8 py-3 ${streamerMode ? 'mt-12' : ''}`}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <img src={appIcon} alt="patro" className="w-7 h-7 rounded-md" />
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-white tracking-tight leading-none">patro</span>
                <span className="text-[9px] text-gray-600 leading-none mt-0.5">v1.0</span>
              </div>
            </div>
            <div className="h-5 w-px bg-gray-800" />
            <button
              onClick={() => setShowLangPicker((p) => !p)}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-gray-800/80 hover:bg-gray-700 transition-colors border border-gray-700/50 hover:border-gray-600"
              style={{ color: LANGUAGE_META[language].color }}
            >
              {LANGUAGE_META[language].icon} {LANGUAGE_META[language].label}
            </button>
            {streamerMode && (
              <span className="text-[10px] text-red-400 uppercase tracking-widest animate-pulse font-semibold">
                LIVE
              </span>
            )}
          </div>
          <nav className="flex gap-1">
            {(Object.keys(VIEW_LABELS) as View[]).map(v => (
              <button
                key={v}
                onClick={() => {
                  setView(v);
                  if (v === 'typing' && isCustomRun) {
                    setIsCustomRun(false);
                    loadPatterns(domain, language);
                  }
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  view === v
                    ? 'bg-gray-800 text-white border border-gray-700/50'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                }`}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Language Picker (slide-down panel) */}
      {showLangPicker && (
        <div className="border-b border-gray-800/50 px-4 sm:px-6 lg:px-8 py-4 animate-fade-in">
          <div className="max-w-6xl mx-auto">
            <LanguageSelector
              selected={language}
              onSelect={(lang) => {
                setLanguage(lang);
                setDomain('default');
                setCurrentIndex(0);
                setShowLangPicker(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {view === 'typing' && (
            <>
              {/* Domain Selector */}
              <DomainBar
                domain={domain}
                setDomain={setDomain}
                language={language}
                isCustomRun={isCustomRun}
                setIsCustomRun={setIsCustomRun}
                currentIndex={currentIndex}
                patternsLength={patterns.length}
                domains={domains}
                languageDomains={languageDomains}
                loadPatterns={loadPatterns}
                refreshDomains={refreshDomains}
                setView={(v) => setView(v as View)}
              />

              {/* Typing Area */}
              {loading ? (
                <div className="flex items-center justify-center min-h-[40vh]">
                  <div className="text-gray-600 text-sm animate-pulse">Loading patterns...</div>
                </div>
              ) : currentPattern ? (
                <>
                <PatternContextCard pattern={currentPattern} language={language} />
                <TypingEngine
                  key={currentPattern.id}
                  pattern={currentPattern}
                  language={language}
                  runProgress={{ current: currentIndex + 1, total: transpiledPatterns.length }}
                  onRunComplete={handleRunComplete}
                />
                </>
              ) : (
                <div className="flex items-center justify-center min-h-[40vh]">
                  <div className="text-center space-y-2">
                    <p className="text-gray-500 text-sm">
                      {LANGUAGE_WORLDS[language]
                        ? `No patterns for this domain in ${LANGUAGE_META[language].label}`
                        : `No native patterns for ${LANGUAGE_META[language].label}`}
                    </p>
                    <p className="text-gray-600 text-xs">
                      {LANGUAGE_WORLDS[language]
                        ? 'Import code or switch domains'
                        : 'Showing transpiled patterns from Python'}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          <StatsPanel visible={view === 'stats'} />
          <WeaknessCloud visible={view === 'weakness'} />
          {view === 'progress' && (
            <div className="flex items-center justify-center min-h-[40vh] text-gray-600 text-sm">
              Skill Tree coming soon...
            </div>
          )}
          <IngestDropZone visible={view === 'import'} onIngestComplete={handleIngestComplete} />
          <CustomRunBuilder visible={view === 'custom_run'} onStartRun={handleStartCustomRun} />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800/50 px-4 sm:px-6 lg:px-8 py-2">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-[10px] text-gray-500">
          <span>ESC to reset | TAB = {language === 'python' ? '4 spaces' : language === 'go' ? 'tab char' : '2 spaces'} | ENTER = newline | Ctrl+Shift+S = Streamer Mode</span>
          <span>patro v1.0 | local-first | zero-cost</span>
        </div>
      </footer>
    </div>
  );
}
