// transpiler/types.ts — IR node types, language metadata, and type definitions

// ─── IR Node Types ───────────────────────────────────────────────────────────

export type IRNode =
  | IRImport
  | IRFunctionDef
  | IRClassDef
  | IRMethodDef
  | IRAssignment
  | IRReturn
  | IRIf
  | IRForLoop
  | IRWhileLoop
  | IRForEnumerate
  | IRForDictItems
  | IRForRange
  | IRTryCatch
  | IRExpression
  | IRComment
  | IRBlank
  | IRRawBlock;

interface IRBase {
  type: string;
  indent: number;
}

export interface IRImport extends IRBase {
  type: "import";
  module: string;
  names: string[]; // empty = import whole module
}

export interface IRFunctionDef extends IRBase {
  type: "function_def";
  name: string;
  params: IRParam[];
  body: IRNode[];
}

export interface IRClassDef extends IRBase {
  type: "class_def";
  name: string;
  methods: IRMethodDef[];
}

export interface IRMethodDef extends IRBase {
  type: "method_def";
  name: string;
  isConstructor: boolean;
  params: IRParam[]; // excludes 'self'
  body: IRNode[];
}

export interface IRParam {
  name: string;
  defaultValue?: string;
  typeHint?: string;
}

export interface IRAssignment extends IRBase {
  type: "assignment";
  target: string;
  value: string;
  isDeclaration: boolean;
  isMulti?: boolean; // tuple unpacking: a, b = x, y
  targets?: string[];
  values?: string[];
}

export interface IRReturn extends IRBase {
  type: "return";
  value: string;
}

export interface IRIf extends IRBase {
  type: "if";
  condition: string;
  body: IRNode[];
  elifs: { condition: string; body: IRNode[] }[];
  elseBody: IRNode[];
}

export interface IRForLoop extends IRBase {
  type: "for_loop";
  variable: string;
  iterable: string;
  body: IRNode[];
}

export interface IRForEnumerate extends IRBase {
  type: "for_enumerate";
  indexVar: string;
  valueVar: string;
  iterable: string;
  body: IRNode[];
}

export interface IRForDictItems extends IRBase {
  type: "for_dict_items";
  keyVar: string;
  valueVar: string;
  dictExpr: string;
  body: IRNode[];
}

export interface IRForRange extends IRBase {
  type: "for_range";
  variable: string;
  start: string;
  end: string;
  body: IRNode[];
}

export interface IRWhileLoop extends IRBase {
  type: "while_loop";
  condition: string;
  body: IRNode[];
}

export interface IRTryCatch extends IRBase {
  type: "try_catch";
  tryBody: IRNode[];
  catches: { exceptionType: string; varName: string; body: IRNode[] }[];
}

export interface IRExpression extends IRBase {
  type: "expression";
  expr: string;
}

export interface IRComment extends IRBase {
  type: "comment";
  text: string;
}

export interface IRBlank extends IRBase {
  type: "blank";
}

export interface IRRawBlock extends IRBase {
  type: "raw_block";
  lines: string[];
}

// ─── Language Types & Metadata ───────────────────────────────────────────────

export type SupportedLanguage =
  | "python"
  | "javascript"
  | "typescript"
  | "java"
  | "cpp"
  | "c"
  | "csharp"
  | "go"
  | "rust"
  | "swift"
  | "php"
  | "ruby"
  | "dart"
  | "lua"
  | "r"
  | "html"
  | "css"
  | "sql"
  | "assembly";

export const TRANSPILABLE_LANGUAGES: SupportedLanguage[] = [
  "python", "javascript", "typescript", "java", "cpp", "c", "csharp",
  "go", "rust", "swift", "php", "ruby", "dart", "lua", "r",
];

export const STATIC_LANGUAGES: SupportedLanguage[] = ["html", "css", "sql"];
export const NATIVE_ONLY_LANGUAGES: SupportedLanguage[] = ["assembly"];

export const ALL_LANGUAGES: SupportedLanguage[] = [...TRANSPILABLE_LANGUAGES, ...STATIC_LANGUAGES, ...NATIVE_ONLY_LANGUAGES];

export const LANGUAGE_EXTENSIONS: Record<SupportedLanguage, string> = {
  python: ".py",
  javascript: ".js",
  typescript: ".ts",
  java: ".java",
  cpp: ".cpp",
  c: ".c",
  csharp: ".cs",
  go: ".go",
  rust: ".rs",
  swift: ".swift",
  php: ".php",
  ruby: ".rb",
  dart: ".dart",
  lua: ".lua",
  r: ".r",
  html: ".html",
  css: ".css",
  sql: ".sql",
  assembly: ".asm",
};

export const LANGUAGE_META: Record<SupportedLanguage, { label: string; icon: string; color: string }> = {
  python: { label: "Python", icon: "\u{1F40D}", color: "#3776AB" },
  javascript: { label: "JavaScript", icon: "JS", color: "#F7DF1E" },
  typescript: { label: "TypeScript", icon: "TS", color: "#3178C6" },
  java: { label: "Java", icon: "\u2615", color: "#ED8B00" },
  cpp: { label: "C++", icon: "C+", color: "#00599C" },
  c: { label: "C", icon: "C", color: "#A8B9CC" },
  csharp: { label: "C#", icon: "C#", color: "#239120" },
  go: { label: "Go", icon: "Go", color: "#00ADD8" },
  rust: { label: "Rust", icon: "\u{1F980}", color: "#CE422B" },
  swift: { label: "Swift", icon: "\u{1F426}", color: "#FA7343" },
  php: { label: "PHP", icon: "\u{1F418}", color: "#777BB4" },
  ruby: { label: "Ruby", icon: "\u{1F48E}", color: "#CC342D" },
  dart: { label: "Dart", icon: "\u{1F3AF}", color: "#0175C2" },
  lua: { label: "Lua", icon: "\u{1F319}", color: "#000080" },
  r: { label: "R", icon: "\u{1F4CA}", color: "#276DC3" },
  html: { label: "HTML", icon: "<>", color: "#E34F26" },
  css: { label: "CSS", icon: "\u{1F3A8}", color: "#1572B6" },
  sql: { label: "SQL", icon: "\u{1F5C3}", color: "#4479A1" },
  assembly: { label: "Assembly", icon: ">>", color: "#6E4C13" },
};
