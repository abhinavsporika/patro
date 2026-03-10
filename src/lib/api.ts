// src/lib/api.ts
// Unified API layer — uses Tauri IPC when in desktop, browser fallback otherwise.

import {
  browserGetNextRun,
  browserSubmitRunResult,
  browserGetPersonalBest,
  browserGetStats,
  browserGetDomainStats,
  browserGetFailureDomains,
  browserFinalizeCalibration,
  browserIsCalibrated,
  browserGetPidConvergence,
  browserRequestIngest,
  browserIngestFiles,
  browserGetAllDomains,
  browserGetAllPatterns,
  browserGetImportedPatterns,
  browserDeletePattern,
  browserDeleteCategory,
  browserClearAllImported,
  ensureSeedsLoaded,
} from './browser-backend';

// ── Tauri detection ──

const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

let tauriInvoke: ((cmd: string, args?: Record<string, unknown>) => Promise<any>) | null = null;

if (isTauri) {
  import('@tauri-apps/api/core').then(mod => {
    tauriInvoke = mod.invoke;
  }).catch(() => {
    console.warn('[patro] Tauri API import failed, falling back to browser mode');
  });
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri && tauriInvoke) {
    return tauriInvoke(cmd, args) as Promise<T>;
  }
  if (isTauri && !tauriInvoke) {
    try {
      const mod = await import('@tauri-apps/api/core');
      tauriInvoke = mod.invoke;
      return tauriInvoke(cmd, args) as Promise<T>;
    } catch {
      // Fall through to browser backend
    }
  }
  return browserInvoke<T>(cmd, args);
}

async function browserInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  await ensureSeedsLoaded();
  switch (cmd) {
    case 'get_next_run':
      return Promise.resolve(browserGetNextRun(
        (args?.domain as string) || 'default',
        (args?.count as number) || 5,
        (args?.language as string) || undefined
      ) as unknown as T);
    case 'submit_run_result':
      return Promise.resolve(browserSubmitRunResult(args?.payload as any) as unknown as T);
    case 'get_personal_best':
      return Promise.resolve(browserGetPersonalBest(args?.patternId as string) as unknown as T);
    case 'get_stats':
      return Promise.resolve(browserGetStats() as unknown as T);
    case 'get_domain_stats':
      return Promise.resolve(browserGetDomainStats() as unknown as T);
    case 'get_failure_domains':
      return Promise.resolve(browserGetFailureDomains() as unknown as T);
    case 'finalize_calibration': {
      browserFinalizeCalibration(args?.initialDifficulty as number);
      return Promise.resolve(undefined as unknown as T);
    }
    case 'is_calibrated':
      return Promise.resolve(browserIsCalibrated() as unknown as T);
    case 'get_pid_convergence':
      return Promise.resolve(browserGetPidConvergence(
        (args?.domain as string) || 'default',
        (args?.limit as number) || 50
      ) as unknown as T);
    case 'request_ingest':
      return Promise.resolve(browserRequestIngest(args?.path as string) as unknown as T);
    default:
      return Promise.reject(new Error(`Unknown command: ${cmd}`));
  }
}

// ── Type exports ──

export interface Pattern {
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

export interface RunResult {
  new_difficulty: number;
  next_patterns: Pattern[];
}

export interface GhostData {
  timestamps: number[];
  wpm: number;
  accuracy: number;
}

export interface UserStats {
  total_runs: number;
  avg_wpm: number;
  avg_accuracy: number;
  best_wpm: number;
}

export interface DomainStat {
  domain: string;
  run_count: number;
  avg_wpm: number;
  avg_accuracy: number;
}

export interface FailureDomain {
  domain: string;
  count: number;
}

export interface IngestResult {
  patterns_ingested: number;
  errors: string[];
}

// ── Public API ──

export async function getNextRun(domain: string, count: number, language?: string): Promise<Pattern[]> {
  return invoke('get_next_run', { domain, count, language });
}

export async function submitRunResult(payload: {
  pattern_id: string;
  domain: string;
  wpm: number;
  accuracy: number;
  character_timestamps?: number[];
}): Promise<RunResult> {
  return invoke('submit_run_result', { payload });
}

export async function getPersonalBest(patternId: string): Promise<GhostData | null> {
  return invoke('get_personal_best', { patternId });
}

export async function getStats(): Promise<UserStats> {
  return invoke('get_stats');
}

export async function getDomainStats(): Promise<DomainStat[]> {
  return invoke('get_domain_stats');
}

export async function getFailureDomains(): Promise<FailureDomain[]> {
  return invoke('get_failure_domains');
}

export async function finalizeCalibration(initialDifficulty: number): Promise<void> {
  return invoke('finalize_calibration', { initialDifficulty });
}

export async function isCalibrated(): Promise<boolean> {
  return invoke('is_calibrated');
}

export async function getPidConvergence(domain: string, limit: number): Promise<[number, number, number][]> {
  return invoke('get_pid_convergence', { domain, limit });
}

export async function requestIngest(path: string): Promise<IngestResult> {
  return invoke('request_ingest', { path });
}

// Get all unique domains (built-in + imported categories)
export async function getAllDomains(): Promise<{ builtIn: string[]; imported: string[] }> {
  await ensureSeedsLoaded();
  return browserGetAllDomains();
}

// Browser-only: ingest files directly via File API (no path needed)
export async function ingestFiles(files: { name: string; content: string }[]): Promise<IngestResult> {
  if (isTauri && tauriInvoke) {
    return { patterns_ingested: 0, errors: ['Use requestIngest(path) in Tauri mode'] };
  }
  return browserIngestFiles(files);
}

// ── Pattern Management ──

export async function getAllPatterns(): Promise<Pattern[]> {
  await ensureSeedsLoaded();
  return browserGetAllPatterns();
}

export function getImportedPatterns(): Pattern[] {
  return browserGetImportedPatterns();
}

export function deletePattern(patternId: string): boolean {
  return browserDeletePattern(patternId);
}

export function deleteCategory(domain: string): number {
  return browserDeleteCategory(domain);
}

export function clearAllImported(): number {
  return browserClearAllImported();
}
