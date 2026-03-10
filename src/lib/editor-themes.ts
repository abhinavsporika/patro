// src/lib/editor-themes.ts
// 5 distinct editor themes for the typing engine.

export type EditorThemeId = 'ide' | 'terminal' | 'vim' | 'leetcode';

export interface EditorTheme {
  id: EditorThemeId;
  label: string;
  icon: string;

  // Container
  borderClass: string;
  borderWinClass: string;    // when completed + won
  borderLoseClass: string;   // when completed + lost
  borderLosingClass: string; // when behind ghost mid-race

  // Title bar
  titleBg: string;
  titleBorder: string;

  // Code area
  codeBg: string;
  codeBgWin: string;
  codeBgLose: string;
  codeBgLosing: string;

  // Gutter
  showGutter: boolean;
  gutterActiveCls: string;
  gutterInactiveCls: string;
  gutterBorderCls: string;
  emptyLineChar: string; // '' or '~'

  // Current line
  currentLineCls: string;

  // Typed text
  typedCorrectCls: string;
  typedErrorCls: string;

  // Cursor
  cursorType: 'line' | 'block';
  cursorCls: string;

  // Syntax highlighting
  useSyntax: boolean;
  monoUntyped: string; // monochrome class for untyped when useSyntax=false

  // Status bar
  statusBg: string;
  statusBorder: string;
  statusText: string;
}

// ── Theme: IDE (VS Code / GitHub dark) ──
const ideTheme: EditorTheme = {
  id: 'ide',
  label: 'Dark Mode',
  icon: '{ }',

  borderClass: 'border-gray-800',
  borderWinClass: 'border-green-800',
  borderLoseClass: 'border-amber-800',
  borderLosingClass: 'border-red-900/50',

  titleBg: 'bg-gray-900',
  titleBorder: 'border-gray-800',

  codeBg: 'bg-[#0d1117]',
  codeBgWin: 'bg-green-950/10',
  codeBgLose: 'bg-amber-950/10',
  codeBgLosing: 'bg-red-950/5',

  showGutter: true,
  gutterActiveCls: 'text-gray-400',
  gutterInactiveCls: 'text-gray-600',
  gutterBorderCls: 'border-r border-gray-800',
  emptyLineChar: '',

  currentLineCls: 'bg-gray-800/80',

  typedCorrectCls: 'text-gray-200',
  typedErrorCls: 'text-red-400 bg-red-900/40 underline decoration-red-500',

  cursorType: 'line',
  cursorCls: 'bg-white',

  useSyntax: true,
  monoUntyped: '',

  statusBg: 'bg-gray-900',
  statusBorder: 'border-gray-800',
  statusText: 'text-gray-600',
};

// ── Theme: Terminal / Command Prompt ──
const terminalTheme: EditorTheme = {
  id: 'terminal',
  label: 'Terminal',
  icon: '>_',

  borderClass: 'border-green-900/40',
  borderWinClass: 'border-green-600/60',
  borderLoseClass: 'border-amber-800/50',
  borderLosingClass: 'border-red-900/40',

  titleBg: 'bg-[#0a0a0a]',
  titleBorder: 'border-green-900/30',

  codeBg: 'bg-black',
  codeBgWin: 'bg-green-950/20',
  codeBgLose: 'bg-amber-950/10',
  codeBgLosing: 'bg-red-950/10',

  showGutter: false,
  gutterActiveCls: '',
  gutterInactiveCls: '',
  gutterBorderCls: '',
  emptyLineChar: '',

  currentLineCls: 'bg-green-950/20',

  typedCorrectCls: 'text-green-400',
  typedErrorCls: 'text-red-500 bg-red-900/30 underline',

  cursorType: 'block',
  cursorCls: 'bg-green-400',

  useSyntax: false,
  monoUntyped: 'text-green-800/80',

  statusBg: 'bg-[#0a0a0a]',
  statusBorder: 'border-green-900/30',
  statusText: 'text-green-700/60',
};

// ── Theme: Vim (IDE-style) ──
const vimTheme: EditorTheme = {
  id: 'vim',
  label: 'IDE-style',
  icon: ':w',

  borderClass: 'border-gray-700',
  borderWinClass: 'border-green-700',
  borderLoseClass: 'border-amber-700',
  borderLosingClass: 'border-red-800',

  titleBg: 'bg-[#1c1c1c]',
  titleBorder: 'border-gray-700',

  codeBg: 'bg-[#1c1c1c]',
  codeBgWin: 'bg-[#1c2c1c]',
  codeBgLose: 'bg-[#2c2a1c]',
  codeBgLosing: 'bg-[#2c1c1c]',

  showGutter: true,
  gutterActiveCls: 'text-yellow-300',
  gutterInactiveCls: 'text-yellow-900/60',
  gutterBorderCls: '',
  emptyLineChar: '~',

  currentLineCls: 'bg-gray-800/60',

  typedCorrectCls: 'text-gray-100',
  typedErrorCls: 'text-red-400 bg-red-900/30 underline',

  cursorType: 'block',
  cursorCls: 'bg-gray-300',

  useSyntax: true,
  monoUntyped: '',

  statusBg: 'bg-[#1c1c1c]',
  statusBorder: 'border-gray-700',
  statusText: 'text-gray-500',
};

// ── Theme: LeetCode (light) ──
const leetcodeTheme: EditorTheme = {
  id: 'leetcode',
  label: 'Light Mode',
  icon: 'LC',

  borderClass: 'border-gray-300',
  borderWinClass: 'border-green-400',
  borderLoseClass: 'border-amber-400',
  borderLosingClass: 'border-red-300',

  titleBg: 'bg-[#fafafa]',
  titleBorder: 'border-gray-200',

  codeBg: 'bg-white',
  codeBgWin: 'bg-green-50',
  codeBgLose: 'bg-amber-50',
  codeBgLosing: 'bg-red-50',

  showGutter: true,
  gutterActiveCls: 'text-gray-600',
  gutterInactiveCls: 'text-gray-300',
  gutterBorderCls: 'border-r border-gray-200',
  emptyLineChar: '',

  currentLineCls: 'bg-yellow-50',

  typedCorrectCls: 'text-gray-900',
  typedErrorCls: 'text-red-600 bg-red-100 underline decoration-red-400',

  cursorType: 'line',
  cursorCls: 'bg-blue-600',

  useSyntax: true,
  monoUntyped: '',

  statusBg: 'bg-[#f5f5f5]',
  statusBorder: 'border-gray-200',
  statusText: 'text-gray-500',
};

export const EDITOR_THEMES: Record<EditorThemeId, EditorTheme> = {
  ide: ideTheme,
  terminal: terminalTheme,
  vim: vimTheme,
  leetcode: leetcodeTheme,
};

export const THEME_ORDER: EditorThemeId[] = ['ide', 'terminal', 'vim', 'leetcode'];
