// src/lib/language-worlds.ts
// Single source of truth for language-specific worlds.
// Each language that has a "world" gets its own set of idiomatic domains.
// Languages without a world use the transpiler fallback (same as current behavior).

import type { SupportedLanguage } from './transpiler';

export interface DomainMeta {
  key: string;
  label: string;
  color: string;
  icon: string;
  description: string;
}

export interface LanguageWorld {
  domains: DomainMeta[];
  welcomeHint: string;
}

export const LANGUAGE_WORLDS: Partial<Record<SupportedLanguage, LanguageWorld>> = {
  python: {
    domains: [
      { key: "decorators",       label: "Decorators & Wrappers",       color: "text-emerald-400", icon: "@",  description: "Python decorators, functools.wraps, retry/cache/auth wrappers" },
      { key: "class_patterns",   label: "Class Patterns",              color: "text-blue-400",    icon: "C",  description: "Singleton, Factory, ABC, dataclasses, __new__/__init__" },
      { key: "generators",       label: "Generators & Iterators",      color: "text-purple-400",  icon: "Y",  description: "yield, __iter__/__next__, generator pipelines, itertools" },
      { key: "context_managers", label: "Context Managers",             color: "text-amber-400",   icon: "W",  description: "with statements, __enter__/__exit__, contextlib" },
      { key: "metaclasses",     label: "Metaclasses & Descriptors",    color: "text-pink-400",    icon: "M",  description: "type(), __class__, descriptors, __set_name__" },
    ],
    welcomeHint: "Start typing to master Pythonic patterns...",
  },
  javascript: {
    domains: [
      { key: "module_patterns",  label: "Module Patterns",  color: "text-yellow-400",  icon: "{}",  description: "IIFE, revealing module, ES modules, closures for encapsulation" },
      { key: "async_patterns",   label: "Async Patterns",   color: "text-blue-400",    icon: "~",   description: "Promises, async/await, event loop, throttle/debounce" },
      { key: "event_driven",     label: "Event-Driven",     color: "text-purple-400",  icon: "!",   description: "EventEmitter, pub/sub, custom events, reactive streams" },
      { key: "functional",       label: "Functional",       color: "text-emerald-400", icon: "f",   description: "Higher-order functions, composition, currying, monads" },
      { key: "proxy_reflect",    label: "Proxy & Reflect",  color: "text-orange-400",  icon: "<>",  description: "Proxy traps, Reflect API, reactive objects, validation" },
    ],
    welcomeHint: "Start typing to master JavaScript idioms...",
  },
  typescript: {
    domains: [
      { key: "generics",           label: "Generics",                    color: "text-blue-400",    icon: "T",  description: "Generic functions, classes, constraints, mapped types" },
      { key: "interface_patterns", label: "Interface Patterns",           color: "text-emerald-400", icon: "I",  description: "Interface segregation, declaration merging, extends vs implements" },
      { key: "type_guards",        label: "Type Guards & Narrowing",     color: "text-purple-400",  icon: "?",  description: "is, in, instanceof, discriminated unions, exhaustive checks" },
      { key: "ts_decorators",      label: "Decorators",                  color: "text-amber-400",   icon: "@",  description: "Class/method/property decorators, metadata reflection" },
      { key: "utility_types",      label: "Utility Types",               color: "text-pink-400",    icon: "<>", description: "Partial, Required, Pick, Omit, Record, conditional types" },
    ],
    welcomeHint: "Start typing to master TypeScript type-level patterns...",
  },
  java: {
    domains: [
      { key: "spring_patterns",    label: "Spring Patterns",       color: "text-green-400",   icon: "S",  description: "DI, @Autowired, @Service, @Repository, bean lifecycle" },
      { key: "abstract_patterns",  label: "Interfaces & Abstract", color: "text-blue-400",    icon: "A",  description: "Abstract classes, interfaces, default methods, sealed classes" },
      { key: "enum_patterns",      label: "Enum Patterns",         color: "text-amber-400",   icon: "E",  description: "Enum with behavior, state machines, strategy via enum" },
      { key: "stream_patterns",    label: "Stream Patterns",       color: "text-purple-400",  icon: "->", description: "Stream API, collectors, map/filter/reduce, Optional" },
      { key: "concurrency",        label: "Concurrency",           color: "text-red-400",     icon: "||", description: "ExecutorService, CompletableFuture, synchronized, locks" },
    ],
    welcomeHint: "Start typing to master Java enterprise patterns...",
  },
  go: {
    domains: [
      { key: "interface_patterns",  label: "Interface Patterns",  color: "text-cyan-400",    icon: "I",  description: "Implicit interfaces, io.Reader/Writer, embedding" },
      { key: "channel_patterns",    label: "Channel Patterns",    color: "text-blue-400",    icon: "<-", description: "Buffered/unbuffered channels, select, fan-in/fan-out" },
      { key: "goroutine_patterns",  label: "Goroutine Patterns",  color: "text-emerald-400", icon: "G",  description: "WaitGroup, errgroup, worker pools, context cancellation" },
      { key: "struct_embedding",    label: "Embedding",           color: "text-purple-400",  icon: "{}",  description: "Struct embedding, composition over inheritance, promoted methods" },
      { key: "error_handling",      label: "Error Handling",      color: "text-amber-400",   icon: "!",  description: "errors.Is/As, error wrapping, sentinel errors, custom types" },
    ],
    welcomeHint: "Start typing to master Go's simplicity-first patterns...",
  },
  rust: {
    domains: [
      { key: "trait_patterns",     label: "Trait Patterns",     color: "text-orange-400",  icon: "T",  description: "Trait objects, impl, dyn, associated types, supertraits" },
      { key: "ownership_patterns", label: "Ownership Patterns", color: "text-red-400",     icon: "&",  description: "Borrowing, lifetimes, Rc/Arc, interior mutability" },
      { key: "enum_match",         label: "Enum & Match",       color: "text-emerald-400", icon: "|",  description: "Sum types, pattern matching, Option/Result, if let" },
      { key: "smart_pointers",     label: "Smart Pointers",     color: "text-blue-400",    icon: "[]", description: "Box, Rc, Arc, RefCell, Cow, Deref coercion" },
      { key: "async_rust",         label: "Async Patterns",     color: "text-purple-400",  icon: "~",  description: "async/await, Future, tokio, Pin, Stream" },
    ],
    welcomeHint: "Start typing to master Rust's zero-cost abstractions...",
  },
  assembly: {
    domains: [
      { key: "register_ops",   label: "Register Operations", color: "text-red-400",     icon: "R",  description: "MOV, ADD, SUB, CMP, register conventions, calling conventions" },
      { key: "stack_memory",   label: "Stack & Memory",      color: "text-amber-400",   icon: "S",  description: "PUSH/POP, stack frames, malloc patterns, heap allocation" },
      { key: "control_flow",   label: "Control Flow",        color: "text-blue-400",    icon: "J",  description: "JMP, conditional branches, loops via CMP+JNE, prologues/epilogues" },
      { key: "system_calls",   label: "System Calls",        color: "text-emerald-400", icon: "$",  description: "syscall/int 0x80, file I/O, process management, signal handling" },
      { key: "addressing",     label: "Addressing Modes",    color: "text-purple-400",  icon: "[]", description: "Direct, indirect, indexed, base+offset, LEA patterns" },
    ],
    welcomeHint: "Start typing to understand what your code compiles to...",
  },
};

// Universal domain for imported code (exists in ALL languages)
export const UNIVERSAL_DOMAINS: DomainMeta[] = [
  { key: "production", label: "Production", color: "text-cyan-400", icon: "~", description: "Imported from your codebase" },
];
