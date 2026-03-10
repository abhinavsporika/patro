// src/components/IngestDropZone.tsx
// Import patterns from files, folders, zips, or GitHub repos.
// Manage imported patterns with batch selection, search, and bulk actions.

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { requestIngest, ingestFiles, getImportedPatterns, deletePattern, deleteCategory, clearAllImported, getAllDomains, IngestResult } from '../lib/api';
import JSZip from 'jszip';

const SUPPORTED_EXTENSIONS = new Set(['.py', '.rs', '.js', '.ts', '.go', '.java']);

function isSupportedFile(name: string): boolean {
  const ext = '.' + name.split('.').pop()?.toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

function isZipFile(name: string): boolean {
  return name.toLowerCase().endsWith('.zip');
}

const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

type Tab = 'import' | 'github' | 'manage';

interface ImportedPattern {
  id: string;
  domain: string;
  difficulty: number;
  content: string;
  source?: string;
}

interface Props {
  visible: boolean;
  onIngestComplete?: () => void;
}

export const IngestDropZone: React.FC<Props> = ({ visible, onIngestComplete }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('import');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // GitHub import state
  const [githubUrl, setGithubUrl] = useState('');
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);

  // Pattern management state
  const [importedPatterns, setImportedPatterns] = useState<ImportedPattern[]>([]);
  const [manageSearch, setManageSearch] = useState('');
  const [manageFilter, setManageFilter] = useState<string>('all');
  const [selectedPatterns, setSelectedPatterns] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  // Load imported patterns when switching to manage tab
  useEffect(() => {
    if (tab === 'manage') {
      setImportedPatterns(getImportedPatterns());
      setSelectedPatterns(new Set());
    }
  }, [tab]);

  // Filtered patterns for manage tab
  const filteredManage = useMemo(() => {
    return importedPatterns.filter(p => {
      if (manageFilter !== 'all' && p.domain !== manageFilter) return false;
      if (manageSearch) {
        const q = manageSearch.toLowerCase();
        return p.content.toLowerCase().includes(q) || p.domain.toLowerCase().includes(q);
      }
      return true;
    });
  }, [importedPatterns, manageFilter, manageSearch]);

  // Grouped by domain for manage
  const manageDomains = useMemo(() => {
    const domains = new Set(importedPatterns.map(p => p.domain));
    return Array.from(domains).sort();
  }, [importedPatterns]);

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsText(file);
    });
  };

  const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsArrayBuffer(file);
    });
  };

  const extractZip = async (file: File): Promise<{ name: string; content: string }[]> => {
    const buffer = await readFileAsArrayBuffer(file);
    const zip = await JSZip.loadAsync(buffer);
    const extracted: { name: string; content: string }[] = [];

    const entries = Object.entries(zip.files);
    for (const [path, entry] of entries) {
      if (entry.dir) continue;
      const filename = path.split('/').pop() || path;
      if (!isSupportedFile(filename)) continue;
      if (path.includes('__pycache__') || path.includes('node_modules') || path.includes('.git/')) continue;
      const content = await entry.async('string');
      extracted.push({ name: filename, content });
    }

    return extracted;
  };

  const processFilesInBrowser = async (fileList: FileList): Promise<IngestResult> => {
    const codeFiles: { name: string; content: string }[] = [];
    const errors: string[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];

      if (isZipFile(file.name)) {
        try {
          const extracted = await extractZip(file);
          codeFiles.push(...extracted);
          if (extracted.length === 0) {
            errors.push(`${file.name}: no supported code files found inside zip`);
          }
        } catch (err) {
          errors.push(`${file.name}: failed to extract zip — ${err}`);
        }
      } else if (isSupportedFile(file.name)) {
        try {
          const content = await readFileAsText(file);
          codeFiles.push({ name: file.name, content });
        } catch (err) {
          errors.push(`${file.name}: failed to read — ${err}`);
        }
      }
    }

    if (codeFiles.length === 0) {
      return { patterns_ingested: 0, errors: errors.length > 0 ? errors : ['No supported code files found (.py, .rs, .js, .ts, .go, .java)'] };
    }

    const result = await ingestFiles(codeFiles);
    return {
      patterns_ingested: result.patterns_ingested,
      errors: [...errors, ...result.errors],
    };
  };

  const handleFiles = useCallback(async (files: FileList) => {
    setError(null);
    setResult(null);

    if (files.length === 0) {
      setError('No files selected.');
      return;
    }

    setIsIngesting(true);
    try {
      if (isTauri) {
        const droppedPath = (files[0] as any).path || files[0].name;
        if (!droppedPath) {
          setError('Could not determine file path.');
          return;
        }
        const res = await requestIngest(droppedPath);
        setResult(res);
        if (res.patterns_ingested > 0 && onIngestComplete) onIngestComplete();
      } else {
        const res = await processFilesInBrowser(files);
        setResult(res);
        if (res.patterns_ingested > 0 && onIngestComplete) onIngestComplete();
      }
    } catch (err) {
      setError(`Ingestion failed: ${err}`);
    } finally {
      setIsIngesting(false);
    }
  }, [onIngestComplete]);

  // ── GitHub Import ──

  const parseGithubUrl = (url: string): { owner: string; repo: string; branch?: string; path?: string } | null => {
    const cleaned = url.trim().replace(/\/$/, '');

    const treeMatch = cleaned.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)(?:\/(.+))?/);
    if (treeMatch) {
      return { owner: treeMatch[1], repo: treeMatch[2], branch: treeMatch[3], path: treeMatch[4] };
    }

    const fullMatch = cleaned.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (fullMatch) {
      return { owner: fullMatch[1], repo: fullMatch[2].replace(/\.git$/, '') };
    }

    const shortMatch = cleaned.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
    if (shortMatch) {
      return { owner: shortMatch[1], repo: shortMatch[2] };
    }

    return null;
  };

  const handleGithubImport = useCallback(async () => {
    setGithubError(null);
    setResult(null);

    const parsed = parseGithubUrl(githubUrl);
    if (!parsed) {
      setGithubError('Invalid GitHub URL. Use: owner/repo or https://github.com/owner/repo');
      return;
    }

    setGithubLoading(true);
    try {
      const branch = parsed.branch || 'main';
      const treeUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${branch}?recursive=1`;

      const treeRes = await fetch(treeUrl);
      if (!treeRes.ok) {
        if (treeRes.status === 404) {
          const masterRes = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/master?recursive=1`);
          if (!masterRes.ok) {
            throw new Error(`Repository not found or not public: ${parsed.owner}/${parsed.repo}`);
          }
          const masterData = await masterRes.json();
          await processGithubTree(masterData, parsed);
          return;
        }
        throw new Error(`GitHub API error: ${treeRes.status}`);
      }

      const treeData = await treeRes.json();
      await processGithubTree(treeData, parsed);
    } catch (err) {
      setGithubError(`GitHub import failed: ${err}`);
    } finally {
      setGithubLoading(false);
    }
  }, [githubUrl, onIngestComplete]);

  const processGithubTree = async (
    treeData: { tree: Array<{ path: string; type: string; url?: string; size?: number }> },
    parsed: { owner: string; repo: string; path?: string }
  ) => {
    const codeFiles: { name: string; content: string }[] = [];
    const errors: string[] = [];

    const files = treeData.tree.filter(item => {
      if (item.type !== 'blob') return false;
      const filename = item.path.split('/').pop() || '';
      if (!isSupportedFile(filename)) return false;
      if (item.path.includes('node_modules/') || item.path.includes('__pycache__/') ||
          item.path.includes('.git/') || item.path.includes('vendor/') ||
          item.path.includes('dist/') || item.path.includes('build/')) return false;
      if (parsed.path && !item.path.startsWith(parsed.path)) return false;
      if (item.size && item.size > 50000) return false;
      return true;
    });

    const filesToFetch = files.slice(0, 50);
    if (files.length > 50) {
      errors.push(`Only importing first 50 of ${files.length} code files (rate limit)`);
    }

    for (let i = 0; i < filesToFetch.length; i += 5) {
      const batch = filesToFetch.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(async (file) => {
          const contentUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents/${file.path}`;
          const res = await fetch(contentUrl, {
            headers: { 'Accept': 'application/vnd.github.raw+json' },
          });
          if (!res.ok) throw new Error(`Failed to fetch ${file.path}`);
          const content = await res.text();
          return { name: file.path.split('/').pop() || file.path, content };
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled') {
          codeFiles.push(r.value);
        } else {
          errors.push(r.reason?.message || 'Unknown fetch error');
        }
      }
    }

    if (codeFiles.length === 0) {
      setResult({ patterns_ingested: 0, errors: errors.length > 0 ? errors : ['No supported code files found in this repository.'] });
      return;
    }

    const res = await ingestFiles(codeFiles);
    setResult({
      patterns_ingested: res.patterns_ingested,
      errors: [...errors, ...res.errors],
    });
    if (res.patterns_ingested > 0 && onIngestComplete) onIngestComplete();
  };

  // ── Pattern Management ──

  const toggleSelect = (id: string) => {
    setSelectedPatterns(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    if (filteredManage.every(p => selectedPatterns.has(p.id))) {
      setSelectedPatterns(prev => {
        const next = new Set(prev);
        filteredManage.forEach(p => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedPatterns(prev => {
        const next = new Set(prev);
        filteredManage.forEach(p => next.add(p.id));
        return next;
      });
    }
  };

  const handleDeleteSelected = () => {
    for (const id of selectedPatterns) {
      deletePattern(id);
    }
    setSelectedPatterns(new Set());
    setImportedPatterns(getImportedPatterns());
    if (onIngestComplete) onIngestComplete();
  };

  const handleDeleteCategory = (domain: string) => {
    deleteCategory(domain);
    setImportedPatterns(getImportedPatterns());
    setSelectedPatterns(new Set());
    if (onIngestComplete) onIngestComplete();
  };

  const handleClearAll = () => {
    clearAllImported();
    setImportedPatterns([]);
    setSelectedPatterns(new Set());
    if (onIngestComplete) onIngestComplete();
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
    e.target.value = '';
  }, [handleFiles]);

  if (!visible) return null;

  const allVisibleSelected = filteredManage.length > 0 && filteredManage.every(p => selectedPatterns.has(p.id));

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-gray-800/50 pb-2">
        {([
          ['import', 'Files / Zip'],
          ['github', 'GitHub Repo'],
          ['manage', 'Manage'],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-t text-xs font-medium transition-colors ${
              tab === t
                ? 'bg-gray-800 text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
            {t === 'manage' && importedPatterns.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-cyan-900/50 text-cyan-400">
                {importedPatterns.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Files / Zip Tab ── */}
      {tab === 'import' && (
        <>
          <p className="text-xs text-gray-500">
            Drop a folder or zip of code files to import new typing patterns.
            Patterns are auto-categorized by content (database, networking, async, etc.).
          </p>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".py,.rs,.js,.ts,.go,.java,.zip"
            onChange={handleFileInputChange}
            className="hidden"
          />
          <input
            ref={folderInputRef}
            type="file"
            // @ts-ignore
            webkitdirectory=""
            // @ts-ignore
            directory=""
            multiple
            onChange={handleFileInputChange}
            className="hidden"
          />

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative flex flex-col items-center justify-center
              h-40 rounded-xl border-2 border-dashed transition-all cursor-pointer
              ${isDragOver
                ? 'border-cyan-400 bg-cyan-400/5 scale-[1.02]'
                : 'border-gray-700 bg-gray-900/50 hover:border-gray-600 hover:bg-gray-900/80'
              }
              ${isIngesting ? 'pointer-events-none opacity-60' : ''}
            `}
          >
            {isIngesting ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-cyan-400">Processing files...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <span className={`text-2xl ${isDragOver ? 'scale-110' : ''} transition-transform`}>
                  {isDragOver ? '+' : '~'}
                </span>
                <span className={`text-sm ${isDragOver ? 'text-cyan-400' : 'text-gray-500'}`}>
                  {isDragOver ? 'Release to import' : 'Drop files here or click to browse'}
                </span>
                <span className="text-[10px] text-gray-600">
                  .py .rs .js .ts .go .java .zip
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              disabled={isIngesting}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all
                bg-cyan-600 hover:bg-cyan-500 text-white
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Add Files
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
              disabled={isIngesting}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all
                bg-gray-700 hover:bg-gray-600 text-gray-300
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Add Folder
            </button>
          </div>
        </>
      )}

      {/* ── GitHub Repo Tab ── */}
      {tab === 'github' && (
        <>
          <p className="text-xs text-gray-500">
            Import code patterns from any public GitHub repository. Patterns are auto-categorized.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !githubLoading) handleGithubImport(); }}
              placeholder="owner/repo or https://github.com/owner/repo"
              disabled={githubLoading}
              className="flex-1 px-3 py-2 rounded-lg text-sm bg-gray-900 border border-gray-700
                text-gray-200 placeholder-gray-600
                focus:outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600/30
                disabled:opacity-50"
            />
            <button
              onClick={handleGithubImport}
              disabled={githubLoading || !githubUrl.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all
                bg-cyan-600 hover:bg-cyan-500 text-white
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {githubLoading ? 'Fetching...' : 'Import'}
            </button>
          </div>

          {githubLoading && (
            <div className="flex items-center gap-3 py-4">
              <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-400">Fetching repository files...</span>
            </div>
          )}

          <div className="text-[10px] text-gray-600 space-y-1">
            <div>Supports: owner/repo, full GitHub URLs, tree/branch/path URLs</div>
            <div>Limits: public repos only, max 50 files, max 50KB per file</div>
          </div>

          {githubError && (
            <div className="p-3 rounded-lg border border-red-800 bg-red-950/30 text-red-400 text-sm">
              {githubError}
            </div>
          )}
        </>
      )}

      {/* ── Manage Tab ── */}
      {tab === 'manage' && (
        <>
          {importedPatterns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-600 text-sm">
              <p>No imported patterns yet.</p>
              <p className="text-xs text-gray-700 mt-1">Import files or a GitHub repo to get started.</p>
            </div>
          ) : (
            <>
              {/* Search + filter bar */}
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  type="text"
                  value={manageSearch}
                  onChange={(e) => setManageSearch(e.target.value)}
                  placeholder="Search patterns..."
                  className="flex-1 min-w-[140px] px-2.5 py-1.5 rounded-lg text-xs bg-gray-900 border border-gray-700
                    text-gray-200 placeholder-gray-600
                    focus:outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600/30"
                />
                <select
                  value={manageFilter}
                  onChange={(e) => setManageFilter(e.target.value)}
                  className="px-2 py-1.5 rounded-lg text-xs bg-gray-900 border border-gray-700 text-gray-300
                    focus:outline-none focus:border-cyan-600"
                >
                  <option value="all">All categories ({importedPatterns.length})</option>
                  {manageDomains.map(d => {
                    const count = importedPatterns.filter(p => p.domain === d).length;
                    return <option key={d} value={d}>{d} ({count})</option>;
                  })}
                </select>
              </div>

              {/* Batch action bar */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-3">
                  <button
                    onClick={selectAllVisible}
                    className="text-[10px] text-gray-500 hover:text-cyan-400 transition-colors"
                  >
                    {allVisibleSelected ? 'Deselect all' : 'Select all'}
                  </button>
                  <span className="text-[10px] text-gray-600">
                    {filteredManage.length} pattern{filteredManage.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedPatterns.size > 0 && (
                    <>
                      <button
                        onClick={handleDeleteSelected}
                        className="px-2 py-0.5 rounded text-[10px] font-medium text-red-500 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                      >
                        Delete {selectedPatterns.size} selected
                      </button>
                      <button
                        onClick={() => setSelectedPatterns(new Set())}
                        className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                      >
                        Clear
                      </button>
                    </>
                  )}
                  {manageFilter !== 'all' && (
                    <button
                      onClick={() => handleDeleteCategory(manageFilter)}
                      className="px-2 py-0.5 rounded text-[10px] text-red-600 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                    >
                      Delete category
                    </button>
                  )}
                  <button
                    onClick={handleClearAll}
                    className="px-2 py-0.5 rounded text-[10px] font-medium text-red-500 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Pattern list */}
              <div className="border border-gray-800 rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
                {filteredManage.length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-600 text-xs">
                    No patterns match your search.
                  </div>
                ) : (
                  filteredManage.map(p => {
                    const isSelected = selectedPatterns.has(p.id);
                    return (
                      <div
                        key={p.id}
                        className={`flex items-start gap-3 px-3 py-2.5 border-b border-gray-800/50 last:border-0 transition-colors ${
                          isSelected
                            ? 'bg-cyan-950/20'
                            : 'hover:bg-gray-800/30'
                        }`}
                      >
                        {/* Checkbox */}
                        <div
                          onClick={() => toggleSelect(p.id)}
                          className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                            isSelected
                              ? 'border-cyan-500 bg-cyan-500'
                              : 'border-gray-600 hover:border-gray-500'
                          }`}
                        >
                          {isSelected && <span className="text-[10px] text-black font-bold">~</span>}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <pre className="text-[11px] text-gray-400 font-mono overflow-hidden whitespace-pre-wrap leading-tight max-h-14">
                            {p.content.slice(0, 120)}{p.content.length > 120 ? '...' : ''}
                          </pre>
                          <div className="flex gap-3 mt-1">
                            <span className="text-[10px] text-cyan-700 font-mono">{p.domain}</span>
                            <span className="text-[10px] text-gray-600">diff: {(p.difficulty * 100).toFixed(0)}%</span>
                            {p.source && <span className="text-[10px] text-gray-700">{p.source}</span>}
                          </div>
                        </div>

                        {/* Quick delete */}
                        <button
                          onClick={() => {
                            deletePattern(p.id);
                            setImportedPatterns(getImportedPatterns());
                            setSelectedPatterns(prev => { const n = new Set(prev); n.delete(p.id); return n; });
                            if (onIngestComplete) onIngestComplete();
                          }}
                          className="px-1.5 py-0.5 rounded text-[10px] text-gray-700 hover:text-red-400 hover:bg-red-950/30 transition-colors shrink-0"
                          title="Delete pattern"
                        >
                          x
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Result display (shared across tabs) */}
      {result && (
        <div className={`p-4 rounded-lg border text-sm ${
          result.patterns_ingested > 0
            ? 'bg-green-950/30 border-green-800 text-green-400'
            : 'bg-yellow-950/30 border-yellow-800 text-yellow-400'
        }`}>
          <div className="font-medium">
            {result.patterns_ingested > 0
              ? `Imported ${result.patterns_ingested} patterns`
              : 'No patterns found'}
          </div>
          {result.errors.length > 0 && (
            <div className="mt-2 text-xs text-gray-500 space-y-1">
              {result.errors.slice(0, 5).map((err, i) => (
                <div key={i}>- {err}</div>
              ))}
              {result.errors.length > 5 && (
                <div>...and {result.errors.length - 5} more warnings</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error display (shared) */}
      {error && (
        <div className="p-3 rounded-lg border border-red-800 bg-red-950/30 text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
};
