// src/lib/browser-backend.ts
// Browser-compatible backend for development/testing outside of Tauri.
// Uses localStorage for persistence and lazy-loaded seed patterns.

interface Pattern {
  id: string;
  domain: string;
  difficulty: number;
  content: string;
  source?: string;
  lang?: string;
  patternName?: string;
  description?: string;
  whenToUse?: string;
  whyItMatters?: string;
}

interface RunRecord {
  id: string;
  pattern_id: string;
  domain: string;
  wpm: number;
  accuracy: number;
  timestamp: number;
  character_timestamps?: number[];
}

interface PidState {
  current_diff: number;
  integral_term: number;
  last_error: number;
  runs_count: number;
}

// ── Lazy seed-pattern loader (code-split into separate chunk) ──

let _seedCache: Pattern[] | null = null;
let _seedPromise: Promise<Pattern[]> | null = null;

function loadSeedPatterns(): Promise<Pattern[]> {
  if (_seedCache) return Promise.resolve(_seedCache);
  if (!_seedPromise) {
    _seedPromise = import('./seed-patterns.json').then(mod => {
      _seedCache = (mod.default || mod) as Pattern[];
      return _seedCache;
    });
  }
  return _seedPromise;
}

/** Synchronous access — returns cached seeds or empty (call ensureSeedsLoaded first) */
function getSeedPatterns(): Pattern[] {
  return _seedCache || [];
}

/** Preload seed patterns — call once at app init */
export async function ensureSeedsLoaded(): Promise<void> {
  await loadSeedPatterns();
}

// ── localStorage helpers ──

const STORE_PREFIX = 'patro_';

function storeGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(STORE_PREFIX + key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function storeSet(key: string, value: unknown): void {
  localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value));
}

// ── Pattern store ──

function getPatterns(): Pattern[] {
  const seed = getSeedPatterns();
  const imported = storeGet<Pattern[]>('imported_patterns', []);
  return [...seed, ...imported];
}

// ── PID Controller (browser-side) ──

function getPidState(domain: string): PidState {
  return storeGet<PidState>(`pid_${domain}`, {
    current_diff: 0.25,
    integral_term: 0,
    last_error: 0,
    runs_count: 0,
  });
}

function savePidState(domain: string, state: PidState): void {
  storeSet(`pid_${domain}`, state);
}

// PID controller tuning constants
const PID_KP = 0.15;  // Proportional gain
const PID_KI = 0.02;  // Integral gain
const PID_KD = 0.08;  // Derivative gain
const TARGET_WPM = 65;
const TARGET_ERROR_RATE = 0.05;
const HIGH_ERROR_PENALTY = 0.15;  // Extra penalty when error rate > 20%

function updateDifficulty(
  state: PidState,
  wpm: number,
  accuracy: number,
  patternDiff: number
): number {
  const wpmError = (TARGET_WPM - wpm) / TARGET_WPM;
  const errorRate = 1 - accuracy;
  const accError = (errorRate - TARGET_ERROR_RATE) / (1 - TARGET_ERROR_RATE);
  const compositeError = 0.6 * wpmError + 0.4 * accError;
  const normalizedError = compositeError * (patternDiff > 0 ? patternDiff : 0.5);

  const p = PID_KP * normalizedError;
  const i = PID_KI * (state.integral_term + normalizedError);
  const d = PID_KD * (normalizedError - state.last_error);

  const confidence = Math.min(state.runs_count / 10, 1.0);
  let adjustment = (p + i + d) * confidence;

  if (errorRate > 0.2) adjustment -= HIGH_ERROR_PENALTY;

  let newDiff = state.current_diff + adjustment;
  newDiff = Math.max(0.05, Math.min(0.95, newDiff));
  newDiff = 0.65 * newDiff + 0.35 * state.current_diff;

  state.current_diff = newDiff;
  state.integral_term = Math.max(-10, Math.min(10, state.integral_term + normalizedError));
  state.last_error = normalizedError;
  state.runs_count += 1;

  return newDiff;
}

// ── Command Implementations ──

export function browserGetNextRun(domain: string, count: number, language?: string): Pattern[] {
  let allPatterns = getPatterns();

  // Language-aware filtering: when a language is specified, prefer its native patterns
  if (language) {
    const nativePatterns = allPatterns.filter(p => p.lang === language);
    if (nativePatterns.length > 0) {
      // For the selected language, use native patterns first
      allPatterns = nativePatterns;
    }
  }

  const pid = getPidState(domain === 'default' ? 'default' : domain);
  const targetDiff = pid.current_diff;
  const tolerance = 0.18;

  let candidates = allPatterns.filter(p => {
    if (domain !== 'default' && p.domain !== domain) return false;
    return Math.abs(p.difficulty - targetDiff) <= tolerance;
  });

  if (candidates.length === 0) {
    candidates = allPatterns.filter(p =>
      domain === 'default' || p.domain === domain
    );
  }

  // Sort by closeness to target difficulty, then shuffle slightly
  candidates.sort((a, b) =>
    Math.abs(a.difficulty - targetDiff) - Math.abs(b.difficulty - targetDiff)
  );

  // Pick up to count patterns with diversity
  const selected: Pattern[] = [];
  const usedIds = new Set<string>();
  for (const c of candidates) {
    if (selected.length >= count) break;
    if (!usedIds.has(c.id)) {
      selected.push({
        id: c.id, domain: c.domain, difficulty: c.difficulty, content: c.content,
        source: c.source, lang: c.lang, patternName: c.patternName,
        description: c.description, whenToUse: c.whenToUse, whyItMatters: c.whyItMatters,
      });
      usedIds.add(c.id);
    }
  }

  return selected;
}

export function browserSubmitRunResult(payload: {
  pattern_id: string;
  domain: string;
  wpm: number;
  accuracy: number;
  character_timestamps?: number[];
}): { new_difficulty: number; next_patterns: Pattern[] } {
  // Record run
  const runs = storeGet<RunRecord[]>('runs', []);
  const run: RunRecord = {
    id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    pattern_id: payload.pattern_id,
    domain: payload.domain,
    wpm: payload.wpm,
    accuracy: payload.accuracy,
    timestamp: Date.now(),
    character_timestamps: payload.character_timestamps,
  };
  runs.push(run);
  storeSet('runs', runs);

  // Save replay for ghost
  if (payload.character_timestamps && payload.character_timestamps.length > 0) {
    const replays = storeGet<Record<string, RunRecord>>('replays', {});
    const existing = replays[payload.pattern_id];
    if (!existing || payload.wpm > existing.wpm) {
      replays[payload.pattern_id] = run;
    }
    storeSet('replays', replays);
  }

  // Save failure vector if accuracy < 0.75
  if (payload.accuracy < 0.75) {
    const failures = storeGet<Array<{ domain: string; pattern_id: string; timestamp: number }>>('failures', []);
    failures.push({ domain: payload.domain, pattern_id: payload.pattern_id, timestamp: Date.now() });
    storeSet('failures', failures);
  }

  // Update PID
  const pidDomain = payload.domain || 'default';
  const pid = getPidState(pidDomain);
  const pattern = getPatterns().find(p => p.id === payload.pattern_id);
  const patternDiff = pattern ? pattern.difficulty : pid.current_diff;
  const newDiff = updateDifficulty(pid, payload.wpm, payload.accuracy, patternDiff);
  savePidState(pidDomain, pid);

  // Generate next patterns
  const nextPatterns = browserGetNextRun(pidDomain, 5);

  return { new_difficulty: newDiff, next_patterns: nextPatterns };
}

export function browserGetPersonalBest(patternId: string): {
  timestamps: number[];
  wpm: number;
  accuracy: number;
} | null {
  const replays = storeGet<Record<string, RunRecord>>('replays', {});
  const replay = replays[patternId];
  if (!replay || !replay.character_timestamps) return null;
  return {
    timestamps: replay.character_timestamps,
    wpm: replay.wpm,
    accuracy: replay.accuracy,
  };
}

export function browserGetStats(): {
  total_runs: number;
  avg_wpm: number;
  avg_accuracy: number;
  best_wpm: number;
} {
  const runs = storeGet<RunRecord[]>('runs', []);
  if (runs.length === 0) {
    return { total_runs: 0, avg_wpm: 0, avg_accuracy: 0, best_wpm: 0 };
  }
  const totalRuns = runs.length;
  const avgWpm = runs.reduce((s, r) => s + r.wpm, 0) / totalRuns;
  const avgAcc = runs.reduce((s, r) => s + r.accuracy, 0) / totalRuns;
  const bestWpm = Math.max(...runs.map(r => r.wpm));
  return { total_runs: totalRuns, avg_wpm: avgWpm, avg_accuracy: avgAcc, best_wpm: bestWpm };
}

export function browserGetDomainStats(): Array<{
  domain: string;
  run_count: number;
  avg_wpm: number;
  avg_accuracy: number;
}> {
  const runs = storeGet<RunRecord[]>('runs', []);
  const byDomain = new Map<string, RunRecord[]>();
  for (const r of runs) {
    const arr = byDomain.get(r.domain) || [];
    arr.push(r);
    byDomain.set(r.domain, arr);
  }
  return Array.from(byDomain.entries()).map(([domain, domRuns]) => ({
    domain,
    run_count: domRuns.length,
    avg_wpm: domRuns.reduce((s, r) => s + r.wpm, 0) / domRuns.length,
    avg_accuracy: domRuns.reduce((s, r) => s + r.accuracy, 0) / domRuns.length,
  }));
}

export function browserGetFailureDomains(): Array<{ domain: string; count: number }> {
  const failures = storeGet<Array<{ domain: string }>>('failures', []);
  const counts = new Map<string, number>();
  for (const f of failures) {
    counts.set(f.domain, (counts.get(f.domain) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count);
}

export function browserFinalizeCalibration(initialDifficulty: number): void {
  const pid: PidState = {
    current_diff: initialDifficulty,
    integral_term: 0,
    last_error: 0,
    runs_count: 0,
  };
  savePidState('default', pid);
  storeSet('calibrated', true);
}

export function browserIsCalibrated(): boolean {
  return storeGet<boolean>('calibrated', false);
}

export function browserGetPidConvergence(_domain: string, _limit: number): [number, number, number][] {
  // Return run history as convergence data
  const runs = storeGet<RunRecord[]>('runs', []);
  const pid = getPidState(_domain === 'default' ? 'default' : _domain);
  return runs
    .filter(r => _domain === 'default' || r.domain === _domain)
    .slice(-_limit)
    .map(r => [pid.current_diff, r.wpm, 1 - r.accuracy] as [number, number, number]);
}

export function browserGetAllDomains(): { builtIn: string[]; imported: string[] } {
  const seed = getSeedPatterns();
  const imported = storeGet<Pattern[]>('imported_patterns', []);

  const builtInSet = new Set(seed.map(p => p.domain));
  const importedSet = new Set<string>();
  for (const p of imported) {
    if (!builtInSet.has(p.domain)) {
      importedSet.add(p.domain);
    }
  }

  return {
    builtIn: Array.from(builtInSet).sort(),
    imported: Array.from(importedSet).sort(),
  };
}

// ── All patterns (for custom run builder) ──

export function browserGetAllPatterns(): Pattern[] {
  return getPatterns();
}

// ── Imported pattern management ──

export function browserGetImportedPatterns(): Pattern[] {
  return storeGet<Pattern[]>('imported_patterns', []);
}

export function browserDeletePattern(patternId: string): boolean {
  const patterns = storeGet<Pattern[]>('imported_patterns', []);
  const filtered = patterns.filter(p => p.id !== patternId);
  if (filtered.length === patterns.length) return false;
  storeSet('imported_patterns', filtered);
  return true;
}

export function browserDeleteCategory(domain: string): number {
  const patterns = storeGet<Pattern[]>('imported_patterns', []);
  const filtered = patterns.filter(p => p.domain !== domain);
  const removed = patterns.length - filtered.length;
  storeSet('imported_patterns', filtered);
  return removed;
}

export function browserClearAllImported(): number {
  const patterns = storeGet<Pattern[]>('imported_patterns', []);
  const count = patterns.length;
  storeSet('imported_patterns', []);
  return count;
}

export function browserRequestIngest(_path: string): { patterns_ingested: number; errors: string[] } {
  return {
    patterns_ingested: 0,
    errors: ['Use the file picker or drag-and-drop to import patterns in browser mode.'],
  };
}

// ── File-based ingestion for browser mode ──

const SUPPORTED_EXTENSIONS: Record<string, string> = {
  '.py': 'python',
  '.rs': 'rust',
  '.js': 'javascript',
  '.ts': 'typescript',
  '.go': 'go',
  '.java': 'java',
};

function detectLanguage(filename: string): string | null {
  const ext = '.' + filename.split('.').pop()?.toLowerCase();
  return SUPPORTED_EXTENSIONS[ext] || null;
}

function estimateDifficulty(content: string): number {
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  const lineCount = lines.length;
  const charCount = content.length;
  const hasNesting = (content.match(/^\s{4,}/gm) || []).length;
  const hasComplexity = /\b(for|while|if|match|switch|try|catch|async|await)\b/g;
  const complexityHits = (content.match(hasComplexity) || []).length;

  let score = 0.1;
  score += Math.min(lineCount / 30, 0.3);
  score += Math.min(charCount / 500, 0.2);
  score += Math.min(hasNesting / 10, 0.15);
  score += Math.min(complexityHits / 8, 0.15);

  return Math.max(0.05, Math.min(0.95, Math.round(score * 100) / 100));
}

function smartCategorize(content: string, filename: string): string {
  const lower = content.toLowerCase();

  // ── Python-style design patterns ──
  if (/def\s+\w+.*:\s*$/m.test(content) && /@\w+/.test(content)) return 'decorators';
  if (/class\s+\w+.*:\s*$/m.test(content) && /__(init|new|enter|exit)__/.test(lower)) return 'class_patterns';
  if (/\byield\b/.test(lower) || /__iter__|__next__/.test(lower)) return 'generators';
  if (/__enter__|__exit__|contextmanager/.test(lower)) return 'context_managers';
  if (/type\(|__class__|__set_name__|__get__/.test(lower)) return 'metaclasses';

  // ── JavaScript/TypeScript-style design patterns ──
  if (/\b(addEventListener|emit|\.on\(|\.off\(|subscribe|EventEmitter)\b/.test(lower)) return 'event_driven';
  if (/\b(async |await |Promise|\.then\(|setTimeout|setInterval)\b/.test(lower)) return 'async_patterns';
  if (/\bnew Proxy\b|Reflect\.|handler\./.test(content)) return 'proxy_reflect';
  if (/=>\s*\{|\.map\(|\.filter\(|\.reduce\(|compose|curry/.test(lower)) return 'functional';
  if (/\b(interface|type\s+\w+\s*=|<T>|<T,|extends\s+\w+<)\b/.test(content)) return 'generics';
  if (/\bis\s+\w+|instanceof|in\s+\w+/.test(content) && /:\s*(string|number|boolean)/.test(content)) return 'type_guards';

  // ── Java-style design patterns ──
  if (/@(Service|Repository|Component|Autowired|Bean)\b/.test(content)) return 'spring_patterns';
  if (/\b(abstract class|implements|extends)\b/.test(content)) return 'abstract_patterns';
  if (/\.stream\(\)|\.collect\(|Collectors\.\w+/.test(content)) return 'stream_patterns';
  if (/\benum\s+\w+\s*\{/.test(content) && /\b(abstract|@Override)\b/.test(content)) return 'enum_patterns';

  // ── Go-style design patterns ──
  if (/\bchan\b|<-|select\s*\{/.test(content)) return 'channel_patterns';
  if (/\bgo\s+func\b|sync\.WaitGroup|errgroup/.test(content)) return 'goroutine_patterns';
  if (/\berrors\.(Is|As|New)\b|fmt\.Errorf/.test(content)) return 'error_handling';
  if (/\btype\s+\w+\s+struct\b/.test(content) && /\btype\s+\w+\s+interface\b/.test(content)) return 'interface_patterns';
  if (/\btype\s+\w+\s+struct\s*\{[^}]*\w+\s*$/m.test(content)) return 'struct_embedding';

  // ── Rust-style design patterns ──
  if (/\btrait\b.*\{|impl\s+\w+\s+for\b/.test(content)) return 'trait_patterns';
  if (/Box<|Rc<|Arc<|RefCell<|Cow</.test(content)) return 'smart_pointers';
  if (/\benum\b.*\{[\s\S]*match\b/.test(content)) return 'enum_match';
  if (/&\w+|&mut\s|lifetime|'a\b/.test(content)) return 'ownership_patterns';

  // ── Assembly-style patterns ──
  if (/\b(mov|add|sub|cmp|jmp|push|pop|call|ret|syscall|int\s+0x80)\b/i.test(content)) return 'register_ops';

  // Fallback: "production" for all unrecognized imported code
  return 'production';
}

function filenameToDomain(filename: string): string {
  // "sort_utils.py" → "sort_utils", "my-algorithms.js" → "my_algorithms"
  // "path/to/helpers.ts" → "helpers"
  const base = filename.split('/').pop() || filename;
  return base
    .replace(/\.[^.]+$/, '')         // remove extension
    .replace(/[^a-zA-Z0-9_]/g, '_') // sanitize
    .replace(/_+/g, '_')            // collapse underscores
    .replace(/^_|_$/g, '')          // trim underscores
    .toLowerCase();
}

/**
 * Smart pattern naming — extracts meaningful names from code content.
 * Priority: function/class name > key variable > import module > filename fallback.
 */
function generatePatternName(
  content: string,
  filename: string,
  chunkIndex: number,
  usedNames: Set<string>
): string {
  let baseName = '';

  // Priority 1: function/class names
  const funcMatch = content.match(
    /(?:def|function|async function|fn|pub fn|func|const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/
  );
  const classMatch = content.match(/(?:class|struct|enum|interface|trait|type)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);

  if (funcMatch) {
    baseName = funcMatch[1];
  } else if (classMatch) {
    baseName = classMatch[1];
  }

  // Priority 2: key variable assignment
  if (!baseName) {
    const varMatch = content.match(/(?:const|let|var|val)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
    if (varMatch) baseName = varMatch[1];
  }

  // Priority 3: import module name
  if (!baseName) {
    const importMatch = content.match(/(?:import|from|use|require\()\s*['"]?([a-zA-Z_][a-zA-Z0-9_/.]*)/);
    if (importMatch) {
      const mod = importMatch[1].split('/').pop()?.split('.')[0] || '';
      baseName = mod + '_snippet';
    }
  }

  // Priority 4: sanitized filename
  if (!baseName) {
    const base = filename.split('/').pop() || filename;
    baseName = base.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
  }

  // Sanitize and create ID
  const sanitized = baseName
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();

  let id = `imported_${sanitized}`;

  // Dedup: append index if collision
  if (usedNames.has(id)) {
    id = `${id}_${chunkIndex}`;
  }
  // Final dedup with counter
  let counter = 2;
  let finalId = id;
  while (usedNames.has(finalId)) {
    finalId = `${id}_${counter++}`;
  }

  return finalId;
}

function codeToPatterns(files: { name: string; content: string }[]): {
  patterns: Pattern[];
  errors: string[];
} {
  const patterns: Pattern[] = [];
  const errors: string[] = [];
  const usedNames = new Set<string>();

  for (const file of files) {
    const lang = detectLanguage(file.name);
    if (!lang) {
      errors.push(`Skipped ${file.name}: unsupported file type`);
      continue;
    }

    const content = file.content.trim();
    if (!content || content.length < 10) {
      errors.push(`Skipped ${file.name}: too short`);
      continue;
    }

    // Split file into logical chunks (functions/classes/blocks)
    const chunks = splitIntoChunks(content, lang);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i].trim();
      const lines = chunk.split('\n').filter(l => l.trim().length > 0);

      // Skip chunks that are too short or too long for typing practice
      if (lines.length < 2 || lines.length > 20) {
        if (lines.length > 20) errors.push(`Skipped chunk in ${file.name}: too long (${lines.length} lines)`);
        continue;
      }

      // Smart categorize each chunk based on its content
      const domain = smartCategorize(chunk, file.name);
      const id = generatePatternName(chunk, file.name, i, usedNames);
      usedNames.add(id);
      const difficulty = estimateDifficulty(chunk);

      patterns.push({
        id,
        domain,
        difficulty,
        content: chunk,
        source: `import:${file.name}`,
      });
    }
  }

  return { patterns, errors };
}

function splitIntoChunks(content: string, lang: string): string[] {
  const lines = content.split('\n');
  const chunks: string[] = [];
  let currentChunk: string[] = [];

  // Language-specific function/block detection
  const blockStarters: Record<string, RegExp> = {
    python: /^(def |class |async def |@)/,
    rust: /^(fn |pub fn |impl |struct |enum |mod )/,
    javascript: /^(function |const \w+ = |class |export |async function )/,
    typescript: /^(function |const \w+ = |class |export |interface |type |async function )/,
    go: /^(func |type |var |const )/,
    java: /^(\s*(public|private|protected|static)\s+(void|int|String|boolean|class|interface)\s)/,
  };

  const starter = blockStarters[lang] || /^(function |def |fn |class )/;

  for (const line of lines) {
    const trimmed = line.trimStart();

    // If this line starts a new block and we have accumulated lines, save the chunk
    if (starter.test(trimmed) && currentChunk.length > 0) {
      const joined = currentChunk.join('\n').trim();
      if (joined.length > 0) chunks.push(joined);
      currentChunk = [];
    }

    currentChunk.push(line);
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    const joined = currentChunk.join('\n').trim();
    if (joined.length > 0) chunks.push(joined);
  }

  // If no chunks were found (no block starters), treat the whole file as one chunk
  if (chunks.length === 0 && content.trim().length > 0) {
    chunks.push(content.trim());
  }

  return chunks;
}

export function browserIngestFiles(files: { name: string; content: string }[]): {
  patterns_ingested: number;
  errors: string[];
} {
  const { patterns, errors } = codeToPatterns(files);

  if (patterns.length === 0) {
    return { patterns_ingested: 0, errors: errors.length > 0 ? errors : ['No valid code patterns found in the provided files.'] };
  }

  // Load existing imported patterns and merge
  const existing = storeGet<Pattern[]>('imported_patterns', []);
  const existingIds = new Set(existing.map(p => p.id));

  let added = 0;
  for (const p of patterns) {
    if (!existingIds.has(p.id)) {
      existing.push(p);
      existingIds.add(p.id);
      added++;
    }
  }

  storeSet('imported_patterns', existing);

  return {
    patterns_ingested: added,
    errors,
  };
}
