// transpiler/parser.ts — Stage 1: Python source → IR nodes
// Also includes the C-style → Python normalizer for transpileFrom()

import type {
  IRNode, IRImport, IRFunctionDef, IRParam,
  IRMethodDef, IRClassDef,
} from './types';

// ─── Python Parser ───────────────────────────────────────────────────────────

function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function collectBlock(lines: string[], startIdx: number, blockIndent: number): { nodes: IRNode[]; endIdx: number } {
  const nodes: IRNode[] = [];
  let i = startIdx;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      nodes.push({ type: "blank", indent: 0 });
      i++;
      continue;
    }
    const indent = getIndentLevel(line);
    if (indent < blockIndent) break;
    const parsed = parseLine(lines, i, blockIndent);
    nodes.push(...parsed.nodes);
    i = parsed.nextIdx;
  }
  return { nodes, endIdx: i };
}

function parseParams(paramStr: string): IRParam[] {
  if (!paramStr.trim()) return [];
  const params: IRParam[] = [];
  let depth = 0;
  let current = "";
  for (const ch of paramStr) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      params.push(parseOneParam(current.trim()));
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) params.push(parseOneParam(current.trim()));
  return params.filter((p) => p.name !== "self");
}

function parseOneParam(s: string): IRParam {
  const eqIdx = s.indexOf("=");
  if (eqIdx !== -1) {
    return { name: s.substring(0, eqIdx).trim(), defaultValue: s.substring(eqIdx + 1).trim() };
  }
  return { name: s };
}

function parseLine(lines: string[], idx: number, baseIndent: number): { nodes: IRNode[]; nextIdx: number } {
  const line = lines[idx];
  const trimmed = line.trim();
  const indent = getIndentLevel(line) - baseIndent;

  // Blank
  if (!trimmed) return { nodes: [{ type: "blank", indent }], nextIdx: idx + 1 };

  // Comment
  if (trimmed.startsWith("#")) {
    return { nodes: [{ type: "comment", text: trimmed.substring(1).trim(), indent }], nextIdx: idx + 1 };
  }

  // Multi-line string blocks (triple quote) — treat as raw
  if (trimmed.includes('"""') || trimmed.includes("'''")) {
    const rawLines: string[] = [trimmed];
    const quote = trimmed.includes('"""') ? '"""' : "'''";
    const firstIdx = trimmed.indexOf(quote);
    const secondIdx = trimmed.indexOf(quote, firstIdx + 3);
    if (secondIdx !== -1) {
      return { nodes: [{ type: "expression", expr: trimmed, indent }], nextIdx: idx + 1 };
    }
    let j = idx + 1;
    while (j < lines.length) {
      rawLines.push(lines[j].trim());
      if (lines[j].includes(quote)) break;
      j++;
    }
    return { nodes: [{ type: "raw_block", lines: rawLines, indent }], nextIdx: j + 1 };
  }

  // Import
  if (trimmed.startsWith("import ") || trimmed.startsWith("from ")) {
    const imp = parseImport(trimmed);
    return { nodes: [{ ...imp, indent }], nextIdx: idx + 1 };
  }

  // Function def
  if (trimmed.startsWith("def ")) {
    return parseFunctionDef(lines, idx, baseIndent, indent);
  }

  // Class def
  if (trimmed.startsWith("class ")) {
    return parseClassDef(lines, idx, baseIndent, indent);
  }

  // If/elif/else
  if (trimmed.startsWith("if ") || trimmed === "if:") {
    return parseIf(lines, idx, baseIndent, indent);
  }

  // For loop
  if (trimmed.startsWith("for ")) {
    return parseFor(lines, idx, baseIndent, indent);
  }

  // While loop
  if (trimmed.startsWith("while ")) {
    return parseWhile(lines, idx, baseIndent, indent);
  }

  // Try/except
  if (trimmed === "try:") {
    return parseTry(lines, idx, baseIndent, indent);
  }

  // Return
  if (trimmed.startsWith("return ") || trimmed === "return") {
    return { nodes: [{ type: "return", value: trimmed === "return" ? "" : trimmed.substring(7), indent }], nextIdx: idx + 1 };
  }

  // Assignment (including augmented: +=, -=, etc.)
  const assignMatch = trimmed.match(/^([a-zA-Z_][\w\[\]."'\-\(\)]*(?:\s*,\s*[a-zA-Z_][\w\[\]."'\-\(\)]*)*)\s*(=|\+=|-=|\*=|\/=|\/\/=|%=)\s*(.+)$/);
  if (assignMatch && !trimmed.startsWith("if ") && !trimmed.startsWith("elif ") && !trimmed.includes("==")) {
    const lhs = assignMatch[1];
    const op = assignMatch[2];
    const rhs = assignMatch[3];

    // Check for tuple unpacking
    if (lhs.includes(",") && op === "=") {
      const targets = lhs.split(",").map((t) => t.trim());
      const values = splitTopLevel(rhs);
      return {
        nodes: [{ type: "assignment", target: lhs, value: rhs, isDeclaration: true, isMulti: true, targets, values, indent }],
        nextIdx: idx + 1,
      };
    }

    const val = op === "=" ? rhs : `${lhs} ${op.charAt(0)} ${rhs}`;
    return {
      nodes: [{ type: "assignment", target: lhs, value: val, isDeclaration: op === "=", indent }],
      nextIdx: idx + 1,
    };
  }

  // General expression (function call, method call, etc.)
  return { nodes: [{ type: "expression", expr: trimmed, indent }], nextIdx: idx + 1 };
}

function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseImport(line: string): IRImport {
  if (line.startsWith("from ")) {
    const m = line.match(/^from\s+([\w.]+)\s+import\s+(.+)$/);
    if (m) return { type: "import", module: m[1], names: m[2].split(",").map((n) => n.trim()), indent: 0 };
  }
  const m = line.match(/^import\s+(.+)$/);
  return { type: "import", module: m ? m[1].trim() : line, names: [], indent: 0 };
}

function parseFunctionDef(lines: string[], idx: number, baseIndent: number, indent: number): { nodes: IRNode[]; nextIdx: number } {
  const line = lines[idx].trim();
  const m = line.match(/^def\s+(\w+)\s*\(([^)]*)\)\s*:/);
  if (!m) return { nodes: [{ type: "expression", expr: line, indent }], nextIdx: idx + 1 };
  const name = m[1];
  const params = parseParams(m[2]);
  const bodyIndent = getIndentLevel(lines[idx]) + 4;
  const actualBodyIndent = idx + 1 < lines.length ? getIndentLevel(lines[idx + 1]) : bodyIndent;
  const block = collectBlock(lines, idx + 1, actualBodyIndent > getIndentLevel(lines[idx]) ? actualBodyIndent : bodyIndent);
  return { nodes: [{ type: "function_def", name, params, body: block.nodes, indent }], nextIdx: block.endIdx };
}

function parseClassDef(lines: string[], idx: number, _baseIndent: number, indent: number): { nodes: IRNode[]; nextIdx: number } {
  const line = lines[idx].trim();
  const m = line.match(/^class\s+(\w+)(?:\s*\([^)]*\))?\s*:/);
  if (!m) return { nodes: [{ type: "expression", expr: line, indent }], nextIdx: idx + 1 };
  const name = m[1];
  const bodyIndent = getIndentLevel(lines[idx]) + 4;
  const actualBodyIndent = idx + 1 < lines.length ? getIndentLevel(lines[idx + 1]) : bodyIndent;
  const block = collectBlock(lines, idx + 1, actualBodyIndent > getIndentLevel(lines[idx]) ? actualBodyIndent : bodyIndent);
  const methods: IRMethodDef[] = [];
  for (const node of block.nodes) {
    if (node.type === "function_def") {
      const fn = node as IRFunctionDef;
      methods.push({
        type: "method_def",
        name: fn.name,
        isConstructor: fn.name === "__init__",
        params: fn.params,
        body: fn.body,
        indent: fn.indent,
      });
    }
  }
  return { nodes: [{ type: "class_def", name, methods, indent } as IRClassDef], nextIdx: block.endIdx };
}

function parseIf(lines: string[], idx: number, _baseIndent: number, indent: number): { nodes: IRNode[]; nextIdx: number } {
  const line = lines[idx].trim();
  const condition = line.replace(/^if\s+/, "").replace(/:$/, "").trim();
  const bodyIndent = getIndentLevel(lines[idx]) + 4;
  const actualBodyIndent = idx + 1 < lines.length ? getIndentLevel(lines[idx + 1]) : bodyIndent;
  const block = collectBlock(lines, idx + 1, actualBodyIndent > getIndentLevel(lines[idx]) ? actualBodyIndent : bodyIndent);

  const elifs: { condition: string; body: IRNode[] }[] = [];
  let elseBody: IRNode[] = [];
  let i = block.endIdx;

  while (i < lines.length) {
    const t = lines[i].trim();
    if (t.startsWith("elif ")) {
      const elifCond = t.replace(/^elif\s+/, "").replace(/:$/, "").trim();
      const elifBodyIndent = i + 1 < lines.length ? getIndentLevel(lines[i + 1]) : getIndentLevel(lines[i]) + 4;
      const elifBlock = collectBlock(lines, i + 1, elifBodyIndent > getIndentLevel(lines[i]) ? elifBodyIndent : getIndentLevel(lines[i]) + 4);
      elifs.push({ condition: elifCond, body: elifBlock.nodes });
      i = elifBlock.endIdx;
    } else if (t === "else:") {
      const elseBodyIndent = i + 1 < lines.length ? getIndentLevel(lines[i + 1]) : getIndentLevel(lines[i]) + 4;
      const elseBlock = collectBlock(lines, i + 1, elseBodyIndent > getIndentLevel(lines[i]) ? elseBodyIndent : getIndentLevel(lines[i]) + 4);
      elseBody = elseBlock.nodes;
      i = elseBlock.endIdx;
      break;
    } else {
      break;
    }
  }

  return { nodes: [{ type: "if", condition, body: block.nodes, elifs, elseBody, indent }], nextIdx: i };
}

function parseFor(lines: string[], idx: number, _baseIndent: number, indent: number): { nodes: IRNode[]; nextIdx: number } {
  const line = lines[idx].trim();
  const bodyIndent = getIndentLevel(lines[idx]) + 4;
  const actualBodyIndent = idx + 1 < lines.length ? getIndentLevel(lines[idx + 1]) : bodyIndent;
  const usedIndent = actualBodyIndent > getIndentLevel(lines[idx]) ? actualBodyIndent : bodyIndent;
  const block = collectBlock(lines, idx + 1, usedIndent);

  // for i, x in enumerate(...)
  const enumMatch = line.match(/^for\s+(\w+)\s*,\s*(\w+)\s+in\s+enumerate\((.+)\)\s*:/);
  if (enumMatch) {
    return {
      nodes: [{ type: "for_enumerate", indexVar: enumMatch[1], valueVar: enumMatch[2], iterable: enumMatch[3], body: block.nodes, indent }],
      nextIdx: block.endIdx,
    };
  }

  // for k, v in dict.items()
  const dictMatch = line.match(/^for\s+(\w+)\s*,\s*(\w+)\s+in\s+(.+)\.items\(\)\s*:/);
  if (dictMatch) {
    return {
      nodes: [{ type: "for_dict_items", keyVar: dictMatch[1], valueVar: dictMatch[2], dictExpr: dictMatch[3], body: block.nodes, indent }],
      nextIdx: block.endIdx,
    };
  }

  // for _ in range(start, end) or range(end)
  const rangeMatch = line.match(/^for\s+(\w+)\s+in\s+range\(([^,]+?)(?:\s*,\s*(.+?))?\)\s*:/);
  if (rangeMatch) {
    const variable = rangeMatch[1];
    const start = rangeMatch[3] ? rangeMatch[2] : "0";
    const end = rangeMatch[3] || rangeMatch[2];
    return {
      nodes: [{ type: "for_range", variable, start, end, body: block.nodes, indent }],
      nextIdx: block.endIdx,
    };
  }

  // General for x in iterable
  const genMatch = line.match(/^for\s+(.+?)\s+in\s+(.+)\s*:/);
  if (genMatch) {
    return {
      nodes: [{ type: "for_loop", variable: genMatch[1], iterable: genMatch[2], body: block.nodes, indent }],
      nextIdx: block.endIdx,
    };
  }

  return { nodes: [{ type: "expression", expr: line, indent }], nextIdx: block.endIdx };
}

function parseWhile(lines: string[], idx: number, _baseIndent: number, indent: number): { nodes: IRNode[]; nextIdx: number } {
  const line = lines[idx].trim();
  const condition = line.replace(/^while\s+/, "").replace(/:$/, "").trim();
  const bodyIndent = getIndentLevel(lines[idx]) + 4;
  const actualBodyIndent = idx + 1 < lines.length ? getIndentLevel(lines[idx + 1]) : bodyIndent;
  const block = collectBlock(lines, idx + 1, actualBodyIndent > getIndentLevel(lines[idx]) ? actualBodyIndent : bodyIndent);
  return { nodes: [{ type: "while_loop", condition, body: block.nodes, indent }], nextIdx: block.endIdx };
}

function parseTry(lines: string[], idx: number, _baseIndent: number, indent: number): { nodes: IRNode[]; nextIdx: number } {
  const bodyIndent = getIndentLevel(lines[idx]) + 4;
  const actualBodyIndent = idx + 1 < lines.length ? getIndentLevel(lines[idx + 1]) : bodyIndent;
  const tryBlock = collectBlock(lines, idx + 1, actualBodyIndent > getIndentLevel(lines[idx]) ? actualBodyIndent : bodyIndent);

  const catches: { exceptionType: string; varName: string; body: IRNode[] }[] = [];
  let i = tryBlock.endIdx;

  while (i < lines.length) {
    const t = lines[i].trim();
    const exceptMatch = t.match(/^except\s*(?:(\w[\w.]*))?\s*(?:as\s+(\w+))?\s*:/);
    if (exceptMatch) {
      const exceptionType = exceptMatch[1] || "Exception";
      const varName = exceptMatch[2] || "e";
      const catchIndent = i + 1 < lines.length ? getIndentLevel(lines[i + 1]) : getIndentLevel(lines[i]) + 4;
      const catchBlock = collectBlock(lines, i + 1, catchIndent > getIndentLevel(lines[i]) ? catchIndent : getIndentLevel(lines[i]) + 4);
      catches.push({ exceptionType, varName, body: catchBlock.nodes });
      i = catchBlock.endIdx;
    } else {
      break;
    }
  }

  return { nodes: [{ type: "try_catch", tryBody: tryBlock.nodes, catches, indent }], nextIdx: i };
}

/** Parse Python source into IR nodes */
export function pythonToIR(source: string): IRNode[] {
  const lines = source.split("\n");
  const nodes: IRNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      nodes.push({ type: "blank", indent: 0 });
      i++;
      continue;
    }
    const parsed = parseLine(lines, i, 0);
    nodes.push(...parsed.nodes);
    i = parsed.nextIdx;
  }
  return nodes;
}

// ─── C-style → Python-like normalizer ────────────────────────────────────────
// Converts JS/TS/Java/Go/Rust/C/C++/C# brace-delimited code into
// Python-like indentation-based form that pythonToIR can parse.

export function normalizeToPython(source: string): string {
  const lines = source.split("\n");
  const result: string[] = [];
  let indentLevel = 0;

  for (let li = 0; li < lines.length; li++) {
    let trimmed = lines[li].trim();

    // Skip empty lines
    if (!trimmed) {
      result.push("");
      continue;
    }

    // Handle closing braces — decrease indent before this line
    while (trimmed.startsWith("}")) {
      indentLevel = Math.max(0, indentLevel - 1);
      trimmed = trimmed.substring(1).trim();
      if (/^(else|catch|finally|elif)/.test(trimmed)) break;
    }

    if (!trimmed || trimmed === "}" || trimmed === "};") continue;

    // Strip trailing semicolons
    trimmed = trimmed.replace(/;\s*$/, "");

    // Convert single-line comments
    trimmed = trimmed.replace(/^\/\/\s?/, "# ");

    // Detect if line opens a block (ends with {)
    const opensBlock = trimmed.endsWith("{");
    if (opensBlock) trimmed = trimmed.slice(0, -1).trim();

    const pad = "    ".repeat(indentLevel);

    // ── Import statements ──
    if (
      trimmed.startsWith("import ") ||
      trimmed.startsWith("from ") ||
      trimmed.startsWith("use ") ||
      /^(const|let|var)\s+.*=\s*require\(/.test(trimmed)
    ) {
      const mod = extractImportModule(trimmed);
      if (mod) {
        result.push(`${pad}import ${mod}`);
      } else {
        result.push(`${pad}# ${trimmed}`);
      }
      if (opensBlock) indentLevel++;
      continue;
    }

    // ── Function definitions ──
    const funcPatterns = [
      /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/,
      /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/,
      /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*\(([^)]*)\)/,
      /^func\s+(\w+)\s*\(([^)]*)\)/,
      /^(?:(?:public|private|protected|static|final|abstract|synchronized)\s+)*(?:void|int|long|float|double|boolean|char|String|[\w<>\[\]]+)\s+(\w+)\s*\(([^)]*)\)/,
    ];
    let funcMatch: RegExpMatchArray | null = null;
    for (const pat of funcPatterns) {
      funcMatch = trimmed.match(pat);
      if (funcMatch) break;
    }

    if (funcMatch) {
      const name = funcMatch[1];
      const params = stripTypeAnnotations(funcMatch[2]);
      result.push(`${pad}def ${name}(${params}):`);
      if (opensBlock) indentLevel++;
      continue;
    }

    // ── Class definitions ──
    const classMatch = trimmed.match(
      /^(?:export\s+)?(?:abstract\s+)?(?:pub\s+)?(?:class|struct|interface)\s+(\w+)/
    );
    if (classMatch) {
      result.push(`${pad}class ${classMatch[1]}:`);
      if (opensBlock) indentLevel++;
      continue;
    }

    // ── If/else if/else ──
    const ifMatch = trimmed.match(/^if\s*\((.+)\)\s*$/);
    if (ifMatch) {
      result.push(`${pad}if ${normalizeCondition(ifMatch[1])}:`);
      if (opensBlock) indentLevel++;
      continue;
    }
    const elseIfMatch = trimmed.match(/^else\s+if\s*\((.+)\)\s*$/);
    if (elseIfMatch) {
      result.push(`${pad}elif ${normalizeCondition(elseIfMatch[1])}:`);
      if (opensBlock) indentLevel++;
      continue;
    }
    if (trimmed === "else" || trimmed === "else:") {
      result.push(`${pad}else:`);
      if (opensBlock) indentLevel++;
      continue;
    }

    // ── For loops ──
    const forOfMatch = trimmed.match(
      /^for\s*\(\s*(?:const|let|var)\s+(\w+)\s+(?:of|in)\s+(.+?)\s*\)\s*$/
    );
    if (forOfMatch) {
      result.push(`${pad}for ${forOfMatch[1]} in ${normalizeExpr(forOfMatch[2])}:`);
      if (opensBlock) indentLevel++;
      continue;
    }
    const forClassicMatch = trimmed.match(
      /^for\s*\(\s*(?:let|var|int|size_t)?\s*(\w+)\s*=\s*(\d+)\s*;\s*\w+\s*<\s*(.+?)\s*;\s*\w+\+\+\s*\)\s*$/
    );
    if (forClassicMatch) {
      const start = forClassicMatch[2];
      const end = normalizeExpr(forClassicMatch[3]);
      result.push(`${pad}for ${forClassicMatch[1]} in range(${start !== "0" ? start + ", " : ""}${end}):`);
      if (opensBlock) indentLevel++;
      continue;
    }
    const goForMatch = trimmed.match(/^for\s+(\w+)\s*,\s*(\w+)\s*:=\s*range\s+(.+)$/);
    if (goForMatch) {
      result.push(`${pad}for ${goForMatch[1]}, ${goForMatch[2]} in enumerate(${normalizeExpr(goForMatch[3])}):`);
      if (opensBlock) indentLevel++;
      continue;
    }

    // ── While loops ──
    const whileMatch = trimmed.match(/^while\s*\((.+)\)\s*$/);
    if (whileMatch) {
      result.push(`${pad}while ${normalizeCondition(whileMatch[1])}:`);
      if (opensBlock) indentLevel++;
      continue;
    }

    // ── Try/catch ──
    if (trimmed === "try") {
      result.push(`${pad}try:`);
      if (opensBlock) indentLevel++;
      continue;
    }
    const catchMatch = trimmed.match(/^catch\s*\(\s*(?:\w+\s+)?(\w+)\s*\)/);
    if (catchMatch) {
      result.push(`${pad}except Exception as ${catchMatch[1]}:`);
      if (opensBlock) indentLevel++;
      continue;
    }
    if (trimmed === "finally") {
      result.push(`${pad}# finally`);
      if (opensBlock) indentLevel++;
      continue;
    }

    // ── Return ──
    const returnMatch = trimmed.match(/^return\s*(.*)/);
    if (returnMatch !== null && trimmed.startsWith("return")) {
      result.push(`${pad}return ${normalizeExpr(returnMatch[1] || "")}`);
      if (opensBlock) indentLevel++;
      continue;
    }

    // ── Assignments ──
    const assignMatch = trimmed.match(
      /^(?:const|let|var|let\s+mut|val|auto)\s+(\w+)\s*(?::\s*[\w<>\[\],\s|&]+)?\s*=\s*(.+)$/
    );
    if (assignMatch) {
      result.push(`${pad}${assignMatch[1]} = ${normalizeExpr(assignMatch[2])}`);
      if (opensBlock) indentLevel++;
      continue;
    }
    const goAssign = trimmed.match(/^(\w+)\s*:=\s*(.+)$/);
    if (goAssign) {
      result.push(`${pad}${goAssign[1]} = ${normalizeExpr(goAssign[2])}`);
      if (opensBlock) indentLevel++;
      continue;
    }

    // ── Default: expression ──
    let expr = normalizeExpr(trimmed);
    if (opensBlock && !expr.endsWith(":")) expr += ":";
    result.push(`${pad}${expr}`);
    if (opensBlock) indentLevel++;
  }

  return result.join("\n");
}

/** Extract module name from various import styles */
function extractImportModule(line: string): string {
  const jsFrom = line.match(/from\s+['"]([^'"]+)['"]/);
  if (jsFrom) return jsFrom[1];
  const req = line.match(/require\(\s*['"]([^'"]+)['"]\s*\)/);
  if (req) return req[1];
  const javaImp = line.match(/^import\s+([\w.]+)/);
  if (javaImp) return javaImp[1];
  const goImp = line.match(/^import\s+['"]([^'"]+)['"]/);
  if (goImp) return goImp[1];
  const rustUse = line.match(/^use\s+([\w:]+)/);
  if (rustUse) return rustUse[1].replace(/::/g, ".");
  return "";
}

/** Strip type annotations from parameter lists */
function stripTypeAnnotations(paramStr: string): string {
  return paramStr
    .split(",")
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return "";
      if (trimmed === "self" || trimmed === "&self" || trimmed === "&mut self") return "";
      const colonMatch = trimmed.match(/^(\w+)\s*:\s*.+/);
      if (colonMatch) return colonMatch[1];
      const typeNameMatch = trimmed.match(/^(?:final\s+)?[\w<>\[\]]+\s+(\w+)$/);
      if (typeNameMatch) return typeNameMatch[1];
      const goMatch = trimmed.match(/^(\w+)\s+[\w.*\[\]]+$/);
      if (goMatch) return goMatch[1];
      const plainMatch = trimmed.match(/^(\w+)$/);
      if (plainMatch) return plainMatch[1];
      return trimmed;
    })
    .filter(Boolean)
    .join(", ");
}

/** Normalize common expression patterns to Python-like form */
function normalizeExpr(expr: string): string {
  let e = expr.trim();
  e = e.replace(/console\.log\(/g, "print(");
  e = e.replace(/System\.out\.println\(/g, "print(");
  e = e.replace(/fmt\.Println\(/g, "print(");
  e = e.replace(/println!\(/g, "print(");
  e = e.replace(/(\w+)\.length(?!\w)/g, "len($1)");
  e = e.replace(/(\w+)\.size\(\)/g, "len($1)");
  e = e.replace(/\.push\(/g, ".append(");
  e = e.replace(/!==/g, "!=");
  e = e.replace(/===/g, "==");
  e = e.replace(/\bnull\b/g, "None");
  e = e.replace(/\bnil\b/g, "None");
  e = e.replace(/\bnullptr\b/g, "None");
  e = e.replace(/\bundefined\b/g, "None");
  e = e.replace(/\bnew\s+/g, "");
  e = e.replace(/\((\w+)\)\s*=>\s*(.+)/g, "lambda $1: $2");
  return e;
}

/** Normalize condition expressions */
function normalizeCondition(cond: string): string {
  let c = normalizeExpr(cond);
  c = c.replace(/&&/g, " and ");
  c = c.replace(/\|\|/g, " or ");
  c = c.replace(/!/g, " not ");
  c = c.replace(/\s+/g, " ").trim();
  return c;
}
