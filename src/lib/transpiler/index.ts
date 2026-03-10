// transpiler/index.ts — Public API entry point
// Re-exports all types and provides the main transpile() functions.

// Re-export all types and constants
export type {
  IRNode, IRImport, IRFunctionDef, IRClassDef, IRMethodDef, IRParam,
  IRAssignment, IRReturn, IRIf, IRForLoop, IRWhileLoop,
  IRForEnumerate, IRForDictItems, IRForRange, IRTryCatch,
  IRExpression, IRComment, IRBlank, IRRawBlock,
} from './types';

export {
  type SupportedLanguage,
  TRANSPILABLE_LANGUAGES,
  STATIC_LANGUAGES,
  NATIVE_ONLY_LANGUAGES,
  ALL_LANGUAGES,
  LANGUAGE_EXTENSIONS,
  LANGUAGE_META,
} from './types';

// Re-export parser
export { pythonToIR } from './parser';

// Import internals for transpile functions
import { pythonToIR, normalizeToPython } from './parser';
import { emitBody } from './emitters';
import { STATIC_LANGUAGES, TRANSPILABLE_LANGUAGES, NATIVE_ONLY_LANGUAGES } from './types';
import type { SupportedLanguage } from './types';

/**
 * Transpile a Python pattern to the target language.
 * Returns the original source unchanged for Python.
 * Returns undefined for static languages (use getStaticPatterns instead).
 */
export function transpile(pythonSource: string, targetLang: SupportedLanguage): string | undefined {
  if (targetLang === "python") return pythonSource;
  if (STATIC_LANGUAGES.includes(targetLang)) return undefined;

  const ir = pythonToIR(pythonSource);
  return emitBody(ir, targetLang, 0);
}

/**
 * Transpile from any supported source language to any target language.
 * Normalizes C-style code -> Python-like form -> IR -> target language.
 */
export function transpileFrom(
  source: string,
  sourceLang: string,
  targetLang: SupportedLanguage
): string | undefined {
  if (STATIC_LANGUAGES.includes(targetLang)) return undefined;

  // If source is already the target, return as-is
  if (sourceLang === targetLang) return source;

  // Python source -> use existing pipeline
  if (sourceLang === "python") return transpile(source, targetLang);

  // C-style source -> normalize to Python-like -> IR -> target
  const normalized = normalizeToPython(source);
  if (!normalized.trim()) return undefined;

  // If target is Python, the normalized form IS the output
  if (targetLang === "python") return normalized;

  const ir = pythonToIR(normalized);
  return emitBody(ir, targetLang, 0);
}

/**
 * Detect source language from a file extension string (e.g., "import:foo.js" -> "javascript")
 */
export function detectSourceLang(source?: string): string {
  if (!source) return "python";
  const filename = source.replace(/^import:/, "");
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    py: "python",
    js: "javascript",
    ts: "typescript",
    jsx: "javascript",
    tsx: "typescript",
    java: "java",
    go: "go",
    rs: "rust",
    c: "c",
    cpp: "cpp",
    cs: "csharp",
    swift: "swift",
    rb: "ruby",
    php: "php",
    dart: "dart",
    lua: "lua",
    r: "r",
  };
  return map[ext] || "python";
}

/**
 * Check if a language supports transpilation.
 * Assembly and static languages (HTML/CSS/SQL) do not.
 */
export function isTranspilable(lang: SupportedLanguage): boolean {
  return TRANSPILABLE_LANGUAGES.includes(lang);
}

/**
 * Check if a language is native-only (no transpilation to/from).
 */
export function isNativeOnly(lang: SupportedLanguage): boolean {
  return NATIVE_ONLY_LANGUAGES.includes(lang);
}

// Expose for testing
export { pythonToIR as _parseToIR } from './parser';
