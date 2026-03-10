// transpiler/emitters.ts — Stage 2: IR nodes → target language output
// Contains all per-language emitter functions and expression translators.

import type {
  IRNode, IRImport, IRFunctionDef, IRClassDef, IRMethodDef,
  IRParam, IRAssignment, IRIf, IRForLoop, IRForEnumerate,
  IRForDictItems, IRForRange, IRWhileLoop, IRTryCatch,
} from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ind = (level: number): string => "    ".repeat(level);

function needsSemicolon(lang: string): boolean {
  return ["java", "cpp", "c", "csharp", "dart", "php"].includes(lang);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Expression Translation ─────────────────────────────────────────────────

export function translateExpr(expr: string, lang: string): string {
  let e = expr;

  // self. → this. / self. / @ etc.
  if (lang !== "python") {
    e = e.replace(/\bself\./g, () => {
      switch (lang) {
        case "javascript": case "typescript": case "java": case "csharp": case "dart": case "php": return "this.";
        case "swift": return "self.";
        case "ruby": return "@";
        case "go": return "s.";
        case "rust": return "self.";
        case "lua": return "self.";
        default: return "self.";
      }
    });
  }

  e = translateFStrings(e, lang);
  e = translateBuiltins(e, lang);
  e = translateOperators(e, lang);

  return e;
}

function translateFStrings(expr: string, lang: string): string {
  const fstringRegex = /f(["'])((?:[^"'\\]|\\.|{[^}]*})*)(\1)/g;
  return expr.replace(fstringRegex, (_match, _quote, content, _endQuote) => {
    switch (lang) {
      case "javascript":
      case "typescript":
      case "dart":
        return "`" + content.replace(/\{([^}]*)\}/g, "${$1}") + "`";
      case "ruby":
        return '"' + content.replace(/\{([^}]*)\}/g, "#{$1}") + '"';
      case "php":
        return '"' + content.replace(/\{([^}]*)\}/g, "{$$1}") + '"';
      case "go":
        { const args: string[] = [];
        const fmt = content.replace(/\{([^}]*)\}/g, (_: string, v: string) => { args.push(v); return "%v"; });
        return `fmt.Sprintf("${fmt}", ${args.join(", ")})`; }
      case "rust":
        { const rustArgs: string[] = [];
        const rustFmt = content.replace(/\{([^}]*)\}/g, (_: string, v: string) => { rustArgs.push(v); return "{}"; });
        return `format!("${rustFmt}", ${rustArgs.join(", ")})`; }
      case "java":
      case "csharp":
        { const jArgs: string[] = [];
        let jIdx = 0;
        const jFmt = content.replace(/\{([^}]*)\}/g, (_: string, v: string) => {
          jArgs.push(v);
          return lang === "csharp" ? `{${jIdx++}}` : "%s";
        });
        return lang === "csharp"
          ? `string.Format("${jFmt}", ${jArgs.join(", ")})`
          : `String.format("${jFmt}", ${jArgs.join(", ")})`; }
      case "swift":
        return '"' + content.replace(/\{([^}]*)\}/g, "\\($1)") + '"';
      case "lua":
        { const luaArgs: string[] = [];
        const luaFmt = content.replace(/\{([^}]*)\}/g, (_: string, v: string) => { luaArgs.push("tostring(" + v + ")"); return "%s"; });
        return `string.format("${luaFmt}", ${luaArgs.join(", ")})`; }
      case "cpp":
      case "c":
        return '"' + content.replace(/\{([^}]*)\}/g, '" + std::to_string($1) + "') + '"';
      case "r":
        { const rArgs: string[] = [];
        const rFmt = content.replace(/\{([^}]*)\}/g, (_: string, v: string) => { rArgs.push(v); return "%s"; });
        return `sprintf("${rFmt}", ${rArgs.join(", ")})`; }
      default:
        return expr;
    }
  });
}

function translateBuiltins(expr: string, lang: string): string {
  let e = expr;

  // len(x) → x.length / x.size() etc.
  e = e.replace(/\blen\(([^)]+)\)/g, (_m, arg) => {
    switch (lang) {
      case "javascript": case "typescript": return `${arg}.length`;
      case "java": return `${arg}.size()`;
      case "cpp": return `${arg}.size()`;
      case "c": return `strlen(${arg})`;
      case "csharp": return `${arg}.Count`;
      case "go": return `len(${arg})`;
      case "rust": return `${arg}.len()`;
      case "swift": return `${arg}.count`;
      case "php": return `count(${arg})`;
      case "ruby": return `${arg}.length`;
      case "dart": return `${arg}.length`;
      case "lua": return `#${arg}`;
      case "r": return `length(${arg})`;
      default: return `len(${arg})`;
    }
  });

  // print(...) → console.log / System.out.println etc.
  e = e.replace(/^print\((.+)\)$/, (_m, arg) => {
    switch (lang) {
      case "javascript": case "typescript": return `console.log(${arg})`;
      case "java": return `System.out.println(${arg})`;
      case "cpp": return `std::cout << ${arg} << std::endl`;
      case "c": return `printf("%s\\n", ${arg})`;
      case "csharp": return `Console.WriteLine(${arg})`;
      case "go": return `fmt.Println(${arg})`;
      case "rust": return `println!("{}", ${arg})`;
      case "swift": return `print(${arg})`;
      case "php": return `echo ${arg}`;
      case "ruby": return `puts ${arg}`;
      case "dart": return `print(${arg})`;
      case "lua": return `print(${arg})`;
      case "r": return `cat(${arg}, "\\n")`;
      default: return `print(${arg})`;
    }
  });

  // append → push / add / push_back
  e = e.replace(/\.append\(/g, (_m) => {
    switch (lang) {
      case "javascript": case "typescript": case "dart": return ".push(";
      case "java": case "csharp": return ".add(";
      case "cpp": return ".push_back(";
      case "go": return " = append(";
      case "rust": return ".push(";
      case "swift": return ".append(";
      case "php": return "[] = ";
      case "ruby": return ".push(";
      case "lua": return "[#... + 1] = ";
      default: return ".append(";
    }
  });

  return e;
}

function translateOperators(expr: string, lang: string): string {
  let e = expr;

  if (lang !== "python" && lang !== "ruby" && lang !== "lua" && lang !== "r") {
    e = e.replace(/\bnot\s+/g, "!");
    e = e.replace(/\band\b/g, "&&");
    e = e.replace(/\bor\b/g, "||");
  }

  // None → null / nil
  e = e.replace(/\bNone\b/g, () => {
    switch (lang) {
      case "javascript": case "typescript": case "java": case "csharp": case "dart": case "php": return "null";
      case "go": return "nil";
      case "rust": return "None";
      case "swift": return "nil";
      case "ruby": return "nil";
      case "lua": return "nil";
      case "r": return "NULL";
      case "cpp": case "c": return "nullptr";
      default: return "None";
    }
  });

  // True/False → true/false
  if (lang !== "python" && lang !== "r") {
    e = e.replace(/\bTrue\b/g, lang === "r" ? "TRUE" : "true");
    e = e.replace(/\bFalse\b/g, lang === "r" ? "FALSE" : "false");
  }

  // // → / for integer division
  if (lang !== "python") {
    e = e.replace(/\/\//g, lang === "java" || lang === "go" || lang === "c" || lang === "cpp" ? "/" : "~/");
  }

  return e;
}

// ─── Condition Translation ───────────────────────────────────────────────────

function translateCondition(cond: string, lang: string): string {
  const rawNotIn = cond.match(/^(.+?)\s+not\s+in\s+(.+)$/);
  if (rawNotIn) {
    const val = translateExpr(rawNotIn[1].trim(), lang);
    const container = translateExpr(rawNotIn[2].trim(), lang);
    return `!${emitContainment(val, container, lang)}`;
  }

  const rawIn = cond.match(/^(.+?)\s+in\s+(.+)$/);
  if (rawIn && !cond.includes("for ")) {
    const val = translateExpr(rawIn[1].trim(), lang);
    const container = translateExpr(rawIn[2].trim(), lang);
    return emitContainment(val, container, lang);
  }

  return translateExpr(cond, lang);
}

function emitContainment(val: string, container: string, lang: string): string {
  switch (lang) {
    case "javascript": case "typescript": return `${container}.has(${val})`;
    case "java": return `${container}.containsKey(${val})`;
    case "cpp": return `${container}.count(${val})`;
    case "csharp": return `${container}.ContainsKey(${val})`;
    case "go": return `${container}[${val}]`;
    case "rust": return `${container}.contains_key(&${val})`;
    case "swift": return `${container}[${val}] != nil`;
    case "php": return `isset(${container}[${val}])`;
    case "ruby": return `${container}.key?(${val})`;
    case "dart": return `${container}.containsKey(${val})`;
    case "lua": return `${container}[${val}] ~= nil`;
    case "r": return `${val} %in% names(${container})`;
    default: return `${val} in ${container}`;
  }
}

// ─── Node Emitters ───────────────────────────────────────────────────────────

export function emitBody(nodes: IRNode[], lang: string, baseIndent: number): string {
  return nodes
    .filter((n) => n.type !== "blank" || true)
    .map((n) => emitNode(n, lang, baseIndent))
    .join("\n");
}

function emitNode(node: IRNode, lang: string, baseIndent: number): string {
  const i = ind(baseIndent + node.indent);
  const semi = needsSemicolon(lang) ? ";" : "";

  switch (node.type) {
    case "blank":
      return "";
    case "comment":
      if (lang === "lua") return `${i}-- ${(node as any).text}`;
      if (lang === "r") return `${i}# ${(node as any).text}`;
      return `${i}// ${(node as any).text}`;
    case "import":
      return emitImport(node as IRImport, lang, i);
    case "function_def":
      return emitFunction(node as IRFunctionDef, lang, baseIndent);
    case "class_def":
      return emitClass(node as IRClassDef, lang, baseIndent);
    case "assignment":
      return emitAssignment(node as IRAssignment, lang, i, semi);
    case "return":
      return `${i}return ${translateExpr((node as any).value, lang)}${semi}`;
    case "if":
      return emitIf(node as IRIf, lang, baseIndent);
    case "for_loop":
      return emitForLoop(node as IRForLoop, lang, baseIndent);
    case "for_enumerate":
      return emitForEnumerate(node as IRForEnumerate, lang, baseIndent);
    case "for_dict_items":
      return emitForDictItems(node as IRForDictItems, lang, baseIndent);
    case "for_range":
      return emitForRange(node as IRForRange, lang, baseIndent);
    case "while_loop":
      return emitWhile(node as IRWhileLoop, lang, baseIndent);
    case "try_catch":
      return emitTryCatch(node as IRTryCatch, lang, baseIndent);
    case "expression":
      return `${i}${translateExpr((node as any).expr, lang)}${semi}`;
    case "raw_block":
      return (node as any).lines.map((l: string) => `${i}${l}`).join("\n");
    default:
      return "";
  }
}

function emitImport(node: IRImport, lang: string, i: string): string {
  const semi = needsSemicolon(lang) ? ";" : "";
  switch (lang) {
    case "javascript":
    case "typescript":
      if (node.names.length)
        return `${i}const { ${node.names.join(", ")} } = require("${node.module}")${semi}`;
      return `${i}const ${node.module} = require("${node.module}")${semi}`;
    case "java":
      return `${i}import ${node.module}${node.names.length ? "." + node.names[0] : ".*"}${semi}`;
    case "cpp":
      return `${i}#include <${node.module}>`;
    case "c":
      return `${i}#include <${node.module}.h>`;
    case "csharp":
      return `${i}using ${node.module}${semi}`;
    case "go":
      return `${i}import "${node.module}"`;
    case "rust":
      return `${i}use ${node.module}${node.names.length ? "::{" + node.names.join(", ") + "}" : ""}${semi}`;
    case "swift":
      return `${i}import ${node.module}`;
    case "php":
      return `${i}use ${node.module}${semi}`;
    case "ruby":
      return `${i}require "${node.module}"`;
    case "dart":
      return `${i}import '${node.module}'${semi}`;
    case "lua":
      return `${i}local ${node.module} = require("${node.module}")`;
    case "r":
      return `${i}library(${node.module})`;
    default:
      return `${i}import ${node.module}`;
  }
}

function emitFunction(node: IRFunctionDef, lang: string, baseIndent: number): string {
  const i = ind(baseIndent + node.indent);
  const params = node.params.map((p) => emitParam(p, lang)).join(", ");
  const bodyStr = emitBody(node.body, lang, baseIndent + node.indent + 1);

  switch (lang) {
    case "javascript":
      return `${i}function ${node.name}(${params}) {\n${bodyStr}\n${i}}`;
    case "typescript":
      return `${i}function ${node.name}(${params}) {\n${bodyStr}\n${i}}`;
    case "java":
      return `${i}public static Object ${node.name}(${params}) {\n${bodyStr}\n${i}}`;
    case "cpp":
      return `${i}auto ${node.name}(${params}) {\n${bodyStr}\n${i}}`;
    case "c":
      return `${i}void ${node.name}(${params}) {\n${bodyStr}\n${i}}`;
    case "csharp":
      return `${i}static object ${node.name}(${params}) {\n${bodyStr}\n${i}}`;
    case "go":
      return `${i}func ${node.name}(${params}) interface{} {\n${bodyStr}\n${i}}`;
    case "rust":
      return `${i}fn ${node.name}(${params}) {\n${bodyStr}\n${i}}`;
    case "swift":
      return `${i}func ${node.name}(${params}) {\n${bodyStr}\n${i}}`;
    case "php":
      return `${i}function ${node.name}(${params}) {\n${bodyStr}\n${i}}`;
    case "ruby":
      return `${i}def ${node.name}(${params})\n${bodyStr}\n${i}end`;
    case "dart":
      return `${i}dynamic ${node.name}(${params}) {\n${bodyStr}\n${i}}`;
    case "lua":
      return `${i}function ${node.name}(${params})\n${bodyStr}\n${i}end`;
    case "r":
      return `${i}${node.name} <- function(${params}) {\n${bodyStr}\n${i}}`;
    default:
      return `${i}def ${node.name}(${params}):\n${bodyStr}`;
  }
}

function emitParam(p: IRParam, lang: string): string {
  const name = p.name;
  if (p.defaultValue !== undefined) {
    const val = translateExpr(p.defaultValue, lang);
    switch (lang) {
      case "java": case "cpp": case "c": case "csharp":
        return `var ${name}`;
      case "go":
        return name;
      case "rust":
        return `${name}: impl Default`;
      default:
        return `${name} = ${val}`;
    }
  }
  switch (lang) {
    case "java": case "csharp": return `Object ${name}`;
    case "cpp": return `auto ${name}`;
    case "c": return `void* ${name}`;
    case "go": return `${name} interface{}`;
    case "rust": return `${name}: impl Any`;
    case "dart": return `dynamic ${name}`;
    case "typescript": return `${name}: any`;
    default: return name;
  }
}

function emitClass(node: IRClassDef, lang: string, baseIndent: number): string {
  const i = ind(baseIndent + node.indent);
  const methods = node.methods.map((m) => emitMethod(m, node.name, lang, baseIndent + node.indent + 1)).join("\n\n");

  switch (lang) {
    case "ruby":
      return `${i}class ${node.name}\n${methods}\n${i}end`;
    case "lua":
      return `${i}local ${node.name} = {}\n${i}${node.name}.__index = ${node.name}\n\n${methods}`;
    case "r":
      return `${i}# R6 Class: ${node.name}\n${methods}`;
    default:
      return `${i}class ${node.name} {\n${methods}\n${i}}`;
  }
}

function emitMethod(node: IRMethodDef, className: string, lang: string, baseIndent: number): string {
  const i = ind(baseIndent);
  const params = node.params.map((p) => emitParam(p, lang)).join(", ");
  const bodyStr = emitBody(node.body, lang, baseIndent + 1);

  if (node.isConstructor) {
    switch (lang) {
      case "javascript": case "typescript":
        return `${i}constructor(${params}) {\n${bodyStr}\n${i}}`;
      case "java": case "csharp":
        return `${i}${className}(${params}) {\n${bodyStr}\n${i}}`;
      case "cpp":
        return `${i}${className}(${params}) {\n${bodyStr}\n${i}}`;
      case "swift":
        return `${i}init(${params}) {\n${bodyStr}\n${i}}`;
      case "dart":
        return `${i}${className}(${params}) {\n${bodyStr}\n${i}}`;
      case "ruby":
        return `${i}def initialize(${params})\n${bodyStr}\n${i}end`;
      case "go":
        return `${i}func New${className}(${params}) *${className} {\n${bodyStr}\n${i}}`;
      case "rust":
        return `${i}fn new(${params}) -> Self {\n${bodyStr}\n${i}}`;
      case "php":
        return `${i}function __construct(${params}) {\n${bodyStr}\n${i}}`;
      case "lua":
        return `${i}function ${className}:new(${params})\n${ind(baseIndent + 1)}local self = setmetatable({}, ${className})\n${bodyStr}\n${ind(baseIndent + 1)}return self\n${i}end`;
      default:
        return `${i}def __init__(self, ${params}):\n${bodyStr}`;
    }
  }

  switch (lang) {
    case "javascript": case "typescript":
      return `${i}${node.name}(${params}) {\n${bodyStr}\n${i}}`;
    case "java": case "csharp":
      return `${i}public Object ${node.name}(${params}) {\n${bodyStr}\n${i}}`;
    case "ruby":
      return `${i}def ${node.name}(${params})\n${bodyStr}\n${i}end`;
    case "lua":
      return `${i}function ${className}:${node.name}(${params})\n${bodyStr}\n${i}end`;
    case "go":
      return `${i}func (s *${className}) ${capitalize(node.name)}(${params}) interface{} {\n${bodyStr}\n${i}}`;
    case "rust":
      return `${i}fn ${node.name}(&mut self, ${params}) {\n${bodyStr}\n${i}}`;
    case "swift":
      return `${i}func ${node.name}(${params}) {\n${bodyStr}\n${i}}`;
    case "php":
      return `${i}function ${node.name}(${params}) {\n${bodyStr}\n${i}}`;
    case "dart":
      return `${i}dynamic ${node.name}(${params}) {\n${bodyStr}\n${i}}`;
    default:
      return `${i}def ${node.name}(self, ${params}):\n${bodyStr}`;
  }
}

function emitAssignment(node: IRAssignment, lang: string, i: string, semi: string): string {
  if (node.isMulti && node.targets && node.values) {
    const lines: string[] = [];
    switch (lang) {
      case "javascript": case "typescript":
        return `${i}const [${node.targets.join(", ")}] = [${node.values.map((v) => translateExpr(v, lang)).join(", ")}]${semi}`;
      case "go":
        return `${i}${node.targets.join(", ")} := ${node.values.map((v) => translateExpr(v, lang)).join(", ")}`;
      case "rust":
        return `${i}let (${node.targets.join(", ")}) = (${node.values.map((v) => translateExpr(v, lang)).join(", ")})${semi}`;
      case "lua":
        return `${i}local ${node.targets.join(", ")} = ${node.values.map((v) => translateExpr(v, lang)).join(", ")}`;
      case "ruby":
        return `${i}${node.targets.join(", ")} = ${node.values.map((v) => translateExpr(v, lang)).join(", ")}`;
      case "php":
        return `${i}list(${node.targets.map((t) => "$" + t).join(", ")}) = [${node.values.map((v) => translateExpr(v, lang)).join(", ")}]${semi}`;
      default:
        for (let idx = 0; idx < node.targets.length; idx++) {
          const v = node.values[idx] || node.values[node.values.length - 1];
          lines.push(`${i}${emitVarDecl(lang)}${node.targets[idx]} = ${translateExpr(v, lang)}${semi}`);
        }
        return lines.join("\n");
    }
  }

  const val = translateExpr(node.value, lang);
  const target = node.target;

  const tgt = target.replace(/^self\./, () => {
    switch (lang) {
      case "javascript": case "typescript": case "java": case "csharp": case "dart": case "php": return "this.";
      case "swift": return "self.";
      case "ruby": return "@";
      case "go": return "s.";
      case "rust": return "self.";
      case "lua": return "self.";
      default: return "self.";
    }
  });

  if (node.isDeclaration && !tgt.includes(".") && !tgt.includes("[")) {
    return `${i}${emitVarDecl(lang)}${tgt} = ${val}${semi}`;
  }
  return `${i}${tgt} = ${val}${semi}`;
}

function emitVarDecl(lang: string): string {
  switch (lang) {
    case "javascript": return "let ";
    case "typescript": return "let ";
    case "java": return "var ";
    case "cpp": return "auto ";
    case "c": return "int ";
    case "csharp": return "var ";
    case "go": return "";
    case "rust": return "let mut ";
    case "swift": return "var ";
    case "php": return "$";
    case "dart": return "var ";
    case "lua": return "local ";
    case "r": return "";
    case "ruby": return "";
    default: return "";
  }
}

function emitIf(node: IRIf, lang: string, baseIndent: number): string {
  const i = ind(baseIndent + node.indent);
  const cond = translateCondition(node.condition, lang);
  const bodyStr = emitBody(node.body, lang, baseIndent + node.indent + 1);

  const useBraces = !["ruby", "lua", "r"].includes(lang);
  const open = useBraces ? " {" : (lang === "lua" ? " then" : "");
  const close = useBraces ? `${i}}` : (lang === "ruby" ? `${i}end` : lang === "lua" ? `${i}end` : `${i}}`);
  const elseIfKw = lang === "ruby" ? "elsif" : lang === "lua" ? "elseif" : "} else if";
  const elseKw = useBraces ? "} else {" : (lang === "ruby" ? "else" : lang === "lua" ? "else" : "} else {");

  let result = `${i}if ${lang === "go" ? "" : "("}${cond}${lang === "go" ? "" : ")"}${open}\n${bodyStr}`;

  for (const elif of node.elifs) {
    const elifCond = translateCondition(elif.condition, lang);
    const elifBody = emitBody(elif.body, lang, baseIndent + node.indent + 1);
    if (useBraces) {
      result += `\n${i}${elseIfKw} (${elifCond}) {\n${elifBody}`;
    } else {
      result += `\n${i}${elseIfKw} ${elifCond}${lang === "lua" ? " then" : ""}\n${elifBody}`;
    }
  }

  if (node.elseBody.length > 0) {
    const elseStr = emitBody(node.elseBody, lang, baseIndent + node.indent + 1);
    result += `\n${i}${elseKw}\n${elseStr}`;
  }

  result += `\n${close}`;
  return result;
}

function emitForLoop(node: IRForLoop, lang: string, baseIndent: number): string {
  const i = ind(baseIndent + node.indent);
  const bodyStr = emitBody(node.body, lang, baseIndent + node.indent + 1);
  const iter = translateExpr(node.iterable, lang);
  const v = node.variable;

  switch (lang) {
    case "javascript": case "typescript":
      return `${i}for (const ${v} of ${iter}) {\n${bodyStr}\n${i}}`;
    case "java":
      return `${i}for (var ${v} : ${iter}) {\n${bodyStr}\n${i}}`;
    case "cpp":
      return `${i}for (auto& ${v} : ${iter}) {\n${bodyStr}\n${i}}`;
    case "csharp":
      return `${i}foreach (var ${v} in ${iter}) {\n${bodyStr}\n${i}}`;
    case "go":
      return `${i}for _, ${v} := range ${iter} {\n${bodyStr}\n${i}}`;
    case "rust":
      return `${i}for ${v} in ${iter} {\n${bodyStr}\n${i}}`;
    case "swift":
      return `${i}for ${v} in ${iter} {\n${bodyStr}\n${i}}`;
    case "php":
      return `${i}foreach ($${iter} as $${v}) {\n${bodyStr}\n${i}}`;
    case "ruby":
      return `${i}${iter}.each do |${v}|\n${bodyStr}\n${i}end`;
    case "dart":
      return `${i}for (var ${v} in ${iter}) {\n${bodyStr}\n${i}}`;
    case "lua":
      return `${i}for _, ${v} in ipairs(${iter}) do\n${bodyStr}\n${i}end`;
    case "r":
      return `${i}for (${v} in ${iter}) {\n${bodyStr}\n${i}}`;
    default:
      return `${i}for ${v} in ${iter}:\n${bodyStr}`;
  }
}

function emitForEnumerate(node: IRForEnumerate, lang: string, baseIndent: number): string {
  const i = ind(baseIndent + node.indent);
  const bodyStr = emitBody(node.body, lang, baseIndent + node.indent + 1);
  const iter = translateExpr(node.iterable, lang);

  switch (lang) {
    case "javascript": case "typescript":
      return `${i}${iter}.forEach((${node.valueVar}, ${node.indexVar}) => {\n${bodyStr}\n${i}})`;
    case "java":
      return `${i}for (int ${node.indexVar} = 0; ${node.indexVar} < ${iter}.size(); ${node.indexVar}++) {\n${ind(baseIndent + node.indent + 1)}var ${node.valueVar} = ${iter}.get(${node.indexVar});\n${bodyStr}\n${i}}`;
    case "cpp":
      return `${i}for (size_t ${node.indexVar} = 0; ${node.indexVar} < ${iter}.size(); ${node.indexVar}++) {\n${ind(baseIndent + node.indent + 1)}auto& ${node.valueVar} = ${iter}[${node.indexVar}];\n${bodyStr}\n${i}}`;
    case "go":
      return `${i}for ${node.indexVar}, ${node.valueVar} := range ${iter} {\n${bodyStr}\n${i}}`;
    case "rust":
      return `${i}for (${node.indexVar}, ${node.valueVar}) in ${iter}.iter().enumerate() {\n${bodyStr}\n${i}}`;
    case "swift":
      return `${i}for (${node.indexVar}, ${node.valueVar}) in ${iter}.enumerated() {\n${bodyStr}\n${i}}`;
    case "ruby":
      return `${i}${iter}.each_with_index do |${node.valueVar}, ${node.indexVar}|\n${bodyStr}\n${i}end`;
    case "csharp":
      return `${i}for (int ${node.indexVar} = 0; ${node.indexVar} < ${iter}.Count; ${node.indexVar}++) {\n${ind(baseIndent + node.indent + 1)}var ${node.valueVar} = ${iter}[${node.indexVar}];\n${bodyStr}\n${i}}`;
    case "dart":
      return `${i}for (int ${node.indexVar} = 0; ${node.indexVar} < ${iter}.length; ${node.indexVar}++) {\n${ind(baseIndent + node.indent + 1)}var ${node.valueVar} = ${iter}[${node.indexVar}];\n${bodyStr}\n${i}}`;
    case "php":
      return `${i}foreach ($${iter} as $${node.indexVar} => $${node.valueVar}) {\n${bodyStr}\n${i}}`;
    case "lua":
      return `${i}for ${node.indexVar}, ${node.valueVar} in ipairs(${iter}) do\n${bodyStr}\n${i}end`;
    case "r":
      return `${i}for (${node.indexVar} in seq_along(${iter})) {\n${ind(baseIndent + node.indent + 1)}${node.valueVar} <- ${iter}[[${node.indexVar}]]\n${bodyStr}\n${i}}`;
    default:
      return `${i}for ${node.indexVar}, ${node.valueVar} in enumerate(${iter}):\n${bodyStr}`;
  }
}

function emitForDictItems(node: IRForDictItems, lang: string, baseIndent: number): string {
  const i = ind(baseIndent + node.indent);
  const bodyStr = emitBody(node.body, lang, baseIndent + node.indent + 1);
  const dict = translateExpr(node.dictExpr, lang);

  switch (lang) {
    case "javascript": case "typescript":
      return `${i}for (const [${node.keyVar}, ${node.valueVar}] of Object.entries(${dict})) {\n${bodyStr}\n${i}}`;
    case "java":
      return `${i}for (var entry : ${dict}.entrySet()) {\n${ind(baseIndent + node.indent + 1)}var ${node.keyVar} = entry.getKey();\n${ind(baseIndent + node.indent + 1)}var ${node.valueVar} = entry.getValue();\n${bodyStr}\n${i}}`;
    case "cpp":
      return `${i}for (auto& [${node.keyVar}, ${node.valueVar}] : ${dict}) {\n${bodyStr}\n${i}}`;
    case "csharp":
      return `${i}foreach (var (${node.keyVar}, ${node.valueVar}) in ${dict}) {\n${bodyStr}\n${i}}`;
    case "go":
      return `${i}for ${node.keyVar}, ${node.valueVar} := range ${dict} {\n${bodyStr}\n${i}}`;
    case "rust":
      return `${i}for (${node.keyVar}, ${node.valueVar}) in ${dict}.iter() {\n${bodyStr}\n${i}}`;
    case "swift":
      return `${i}for (${node.keyVar}, ${node.valueVar}) in ${dict} {\n${bodyStr}\n${i}}`;
    case "php":
      return `${i}foreach ($${dict} as $${node.keyVar} => $${node.valueVar}) {\n${bodyStr}\n${i}}`;
    case "ruby":
      return `${i}${dict}.each do |${node.keyVar}, ${node.valueVar}|\n${bodyStr}\n${i}end`;
    case "dart":
      return `${i}${dict}.forEach((${node.keyVar}, ${node.valueVar}) {\n${bodyStr}\n${i}});`;
    case "lua":
      return `${i}for ${node.keyVar}, ${node.valueVar} in pairs(${dict}) do\n${bodyStr}\n${i}end`;
    case "r":
      return `${i}for (${node.keyVar} in names(${dict})) {\n${ind(baseIndent + node.indent + 1)}${node.valueVar} <- ${dict}[[${node.keyVar}]]\n${bodyStr}\n${i}}`;
    default:
      return `${i}for ${node.keyVar}, ${node.valueVar} in ${dict}.items():\n${bodyStr}`;
  }
}

function emitForRange(node: IRForRange, lang: string, baseIndent: number): string {
  const i = ind(baseIndent + node.indent);
  const bodyStr = emitBody(node.body, lang, baseIndent + node.indent + 1);
  const v = node.variable;
  const start = translateExpr(node.start, lang);
  const end = translateExpr(node.end, lang);

  switch (lang) {
    case "javascript": case "typescript":
      return `${i}for (let ${v} = ${start}; ${v} < ${end}; ${v}++) {\n${bodyStr}\n${i}}`;
    case "java": case "csharp": case "dart":
      return `${i}for (${lang === "dart" ? "int" : "var"} ${v} = ${start}; ${v} < ${end}; ${v}++) {\n${bodyStr}\n${i}}`;
    case "cpp": case "c":
      return `${i}for (int ${v} = ${start}; ${v} < ${end}; ${v}++) {\n${bodyStr}\n${i}}`;
    case "go":
      return `${i}for ${v} := ${start}; ${v} < ${end}; ${v}++ {\n${bodyStr}\n${i}}`;
    case "rust":
      return `${i}for ${v} in ${start}..${end} {\n${bodyStr}\n${i}}`;
    case "swift":
      return `${i}for ${v} in ${start}..<${end} {\n${bodyStr}\n${i}}`;
    case "php":
      return `${i}for ($${v} = ${start}; $${v} < ${end}; $${v}++) {\n${bodyStr}\n${i}}`;
    case "ruby":
      return `${i}(${start}...${end}).each do |${v}|\n${bodyStr}\n${i}end`;
    case "lua":
      return `${i}for ${v} = ${start}, ${end} - 1 do\n${bodyStr}\n${i}end`;
    case "r":
      return `${i}for (${v} in ${start}:(${end}-1)) {\n${bodyStr}\n${i}}`;
    default:
      return `${i}for ${v} in range(${start}, ${end}):\n${bodyStr}`;
  }
}

function emitWhile(node: IRWhileLoop, lang: string, baseIndent: number): string {
  const i = ind(baseIndent + node.indent);
  const cond = translateCondition(node.condition, lang);
  const bodyStr = emitBody(node.body, lang, baseIndent + node.indent + 1);

  switch (lang) {
    case "ruby":
      return `${i}while ${cond}\n${bodyStr}\n${i}end`;
    case "lua":
      return `${i}while ${cond} do\n${bodyStr}\n${i}end`;
    case "go":
      return `${i}for ${cond} {\n${bodyStr}\n${i}}`;
    default:
      return `${i}while (${cond}) {\n${bodyStr}\n${i}}`;
  }
}

function emitTryCatch(node: IRTryCatch, lang: string, baseIndent: number): string {
  const i = ind(baseIndent + node.indent);
  const tryBody = emitBody(node.tryBody, lang, baseIndent + node.indent + 1);

  let result = "";
  switch (lang) {
    case "javascript": case "typescript":
      result = `${i}try {\n${tryBody}`;
      for (const c of node.catches) {
        const catchBody = emitBody(c.body, lang, baseIndent + node.indent + 1);
        result += `\n${i}} catch (${c.varName}) {\n${catchBody}`;
      }
      result += `\n${i}}`;
      return result;
    case "java":
      result = `${i}try {\n${tryBody}`;
      for (const c of node.catches) {
        const catchBody = emitBody(c.body, lang, baseIndent + node.indent + 1);
        result += `\n${i}} catch (Exception ${c.varName}) {\n${catchBody}`;
      }
      result += `\n${i}}`;
      return result;
    case "cpp":
      result = `${i}try {\n${tryBody}`;
      for (const c of node.catches) {
        const catchBody = emitBody(c.body, lang, baseIndent + node.indent + 1);
        result += `\n${i}} catch (const std::exception& ${c.varName}) {\n${catchBody}`;
      }
      result += `\n${i}}`;
      return result;
    case "csharp":
      result = `${i}try {\n${tryBody}`;
      for (const c of node.catches) {
        const catchBody = emitBody(c.body, lang, baseIndent + node.indent + 1);
        result += `\n${i}} catch (Exception ${c.varName}) {\n${catchBody}`;
      }
      result += `\n${i}}`;
      return result;
    case "go":
      result = `${i}func() {\n${ind(baseIndent + node.indent + 1)}defer func() {\n${ind(baseIndent + node.indent + 2)}if r := recover(); r != nil {\n`;
      for (const c of node.catches) {
        const catchBody = emitBody(c.body, lang, baseIndent + node.indent + 3);
        result += catchBody;
      }
      result += `\n${ind(baseIndent + node.indent + 2)}}\n${ind(baseIndent + node.indent + 1)}}()\n${tryBody}\n${i}}()`;
      return result;
    case "rust":
      result = `${i}match (|| -> Result<(), Box<dyn std::error::Error>> {\n${tryBody}\n${ind(baseIndent + node.indent + 1)}Ok(())\n${i}})() {\n${ind(baseIndent + node.indent + 1)}Ok(_) => {},\n`;
      for (const c of node.catches) {
        const catchBody = emitBody(c.body, lang, baseIndent + node.indent + 2);
        result += `${ind(baseIndent + node.indent + 1)}Err(${c.varName}) => {\n${catchBody}\n${ind(baseIndent + node.indent + 1)}}`;
      }
      result += `\n${i}}`;
      return result;
    case "swift":
      result = `${i}do {\n${tryBody}`;
      for (const c of node.catches) {
        const catchBody = emitBody(c.body, lang, baseIndent + node.indent + 1);
        result += `\n${i}} catch let ${c.varName} {\n${catchBody}`;
      }
      result += `\n${i}}`;
      return result;
    case "php":
      result = `${i}try {\n${tryBody}`;
      for (const c of node.catches) {
        const catchBody = emitBody(c.body, lang, baseIndent + node.indent + 1);
        result += `\n${i}} catch (Exception $${c.varName}) {\n${catchBody}`;
      }
      result += `\n${i}}`;
      return result;
    case "ruby":
      result = `${i}begin\n${tryBody}`;
      for (const c of node.catches) {
        const catchBody = emitBody(c.body, lang, baseIndent + node.indent + 1);
        result += `\n${i}rescue => ${c.varName}\n${catchBody}`;
      }
      result += `\n${i}end`;
      return result;
    case "dart":
      result = `${i}try {\n${tryBody}`;
      for (const c of node.catches) {
        const catchBody = emitBody(c.body, lang, baseIndent + node.indent + 1);
        result += `\n${i}} catch (${c.varName}) {\n${catchBody}`;
      }
      result += `\n${i}}`;
      return result;
    case "lua":
      result = `${i}local ok, err = pcall(function()\n${tryBody}\n${i}end)\n${i}if not ok then\n`;
      for (const c of node.catches) {
        const catchBody = emitBody(c.body, lang, baseIndent + node.indent + 1);
        result += catchBody;
      }
      result += `\n${i}end`;
      return result;
    case "r":
      result = `${i}tryCatch({\n${tryBody}\n${i}}, error = function(e) {\n`;
      for (const c of node.catches) {
        const catchBody = emitBody(c.body, lang, baseIndent + node.indent + 1);
        result += catchBody;
      }
      result += `\n${i}})`;
      return result;
    default:
      result = `${i}try:\n${tryBody}`;
      for (const c of node.catches) {
        const catchBody = emitBody(c.body, lang, baseIndent + node.indent + 1);
        result += `\n${i}except ${c.exceptionType} as ${c.varName}:\n${catchBody}`;
      }
      return result;
  }
}
