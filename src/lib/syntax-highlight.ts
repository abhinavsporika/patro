// src/lib/syntax-highlight.ts
// Lightweight per-character syntax highlighting for the typing engine.
// Returns a token type for each character, which the renderer maps to theme colors.

// Common keywords across languages
const KEYWORDS = new Set([
  // JS/TS
  'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while',
  'class', 'import', 'export', 'from', 'new', 'this', 'async', 'await',
  'try', 'catch', 'throw', 'typeof', 'instanceof', 'switch', 'case',
  'break', 'continue', 'default', 'extends', 'implements', 'interface',
  'type', 'enum', 'null', 'undefined', 'true', 'false', 'void',
  // Python
  'def', 'class', 'import', 'from', 'return', 'if', 'elif', 'else',
  'for', 'while', 'in', 'not', 'and', 'or', 'is', 'None', 'True', 'False',
  'with', 'as', 'try', 'except', 'finally', 'raise', 'pass', 'yield',
  'lambda', 'global', 'nonlocal', 'assert', 'del', 'print', 'self',
  // Rust
  'fn', 'let', 'mut', 'pub', 'struct', 'enum', 'impl', 'trait', 'use',
  'mod', 'match', 'loop', 'move', 'ref', 'where', 'unsafe', 'extern',
  // Go
  'func', 'package', 'import', 'type', 'struct', 'interface', 'map',
  'chan', 'go', 'defer', 'range', 'select', 'nil',
  // Java/C
  'public', 'private', 'protected', 'static', 'final', 'abstract',
  'int', 'float', 'double', 'char', 'boolean', 'string', 'void',
  'String', 'int', 'long', 'byte', 'short',
  // SQL-ish
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE',
  'TABLE', 'INDEX', 'JOIN', 'ON', 'AND', 'OR', 'NOT', 'NULL',
]);

export type TokenType = 'keyword' | 'string' | 'comment' | 'number' | 'punctuation' | 'normal';

// Color palettes for each theme variant (dimmed = untyped target text)
type Palette = Record<TokenType, string>;

const PALETTES: Record<string, Palette> = {
  // Dark themes (IDE, Vim, Emacs)
  dark: {
    keyword:     'text-purple-500',
    string:      'text-green-600',
    comment:     'text-gray-500 italic',
    number:      'text-amber-600',
    punctuation: 'text-gray-500',
    normal:      'text-gray-500',
  },
  // Vim / IDE-style
  vim: {
    keyword:     'text-fuchsia-500',
    string:      'text-sky-500',
    comment:     'text-gray-500 italic',
    number:      'text-yellow-500',
    punctuation: 'text-gray-500',
    normal:      'text-gray-500',
  },
  // Light theme (LeetCode)
  light: {
    keyword:     'text-blue-400',
    string:      'text-green-400',
    comment:     'text-gray-400 italic',
    number:      'text-orange-400',
    punctuation: 'text-gray-400',
    normal:      'text-gray-400',
  },
};

/**
 * Returns an array of color classes, one per character.
 */
export function highlightCode(code: string, palette: string = 'dark'): string[] {
  const colors = PALETTES[palette] || PALETTES.dark;
  const result: string[] = new Array(code.length).fill(colors.normal);

  let i = 0;
  while (i < code.length) {
    // Skip whitespace
    if (code[i] === ' ' || code[i] === '\t' || code[i] === '\n') {
      result[i] = colors.normal;
      i++;
      continue;
    }

    // Line comments: // or #
    if (
      (code[i] === '/' && code[i + 1] === '/') ||
      (code[i] === '#' && (i === 0 || code[i - 1] === '\n' || code[i - 1] === ' '))
    ) {
      while (i < code.length && code[i] !== '\n') {
        result[i] = colors.comment;
        i++;
      }
      continue;
    }

    // Block comments: /* ... */
    if (code[i] === '/' && code[i + 1] === '*') {
      result[i] = colors.comment;
      result[i + 1] = colors.comment;
      i += 2;
      while (i < code.length) {
        result[i] = colors.comment;
        if (code[i] === '*' && code[i + 1] === '/') {
          result[i + 1] = colors.comment;
          i += 2;
          break;
        }
        i++;
      }
      continue;
    }

    // Strings: ' " ` and f-strings f" f'
    if (code[i] === '"' || code[i] === "'" || code[i] === '`' ||
        (code[i] === 'f' && (code[i + 1] === '"' || code[i + 1] === "'"))) {
      if (code[i] === 'f') {
        result[i] = colors.string;
        i++;
      }
      const quote = code[i];
      result[i] = colors.string;
      i++;
      while (i < code.length && code[i] !== quote && code[i] !== '\n') {
        if (code[i] === '\\' && i + 1 < code.length) {
          result[i] = colors.string;
          result[i + 1] = colors.string;
          i += 2;
          continue;
        }
        result[i] = colors.string;
        i++;
      }
      if (i < code.length && code[i] === quote) {
        result[i] = colors.string;
        i++;
      }
      continue;
    }

    // Numbers
    if (/[0-9]/.test(code[i]) && (i === 0 || /[\s(,=+\-*/<>[\]{};:]/.test(code[i - 1]))) {
      while (i < code.length && /[0-9._xXa-fA-F]/.test(code[i])) {
        result[i] = colors.number;
        i++;
      }
      continue;
    }

    // Words (identifiers / keywords)
    if (/[a-zA-Z_$]/.test(code[i])) {
      const start = i;
      while (i < code.length && /[a-zA-Z0-9_$]/.test(code[i])) {
        i++;
      }
      const word = code.slice(start, i);
      const isKw = KEYWORDS.has(word);
      for (let j = start; j < i; j++) {
        result[j] = isKw ? colors.keyword : colors.normal;
      }
      continue;
    }

    // Punctuation
    if (/[{}()\[\];:.,=+\-*/<>!&|?@^%~]/.test(code[i])) {
      result[i] = colors.punctuation;
      i++;
      continue;
    }

    result[i] = colors.normal;
    i++;
  }

  return result;
}
