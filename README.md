# Patro

**Adaptive code typing trainer that makes you faster at writing real code.**

Practice 280+ patterns across 17 programming languages with adaptive difficulty, ghost racing, and real-time performance tracking. Runs entirely locally with zero backend — your data stays on your machine.

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

---

## Features

### 17 Languages

7 native language worlds — each with 5 idiomatic domains and 40 hand-crafted patterns:

| World | Domains |
|-------|---------|
| **Python** | Decorators, Classes, Generators, Context Managers, Metaclasses |
| **JavaScript** | Modules, Async, Events, Functional, Proxy & Reflect |
| **TypeScript** | Generics, Interfaces, Type Guards, Decorators, Utility Types |
| **Java** | Spring, Interfaces, Enums, Streams, Concurrency |
| **Go** | Interfaces, Channels, Goroutines, Embedding, Error Handling |
| **Rust** | Traits, Ownership, Enum & Match, Smart Pointers, Async |
| **Assembly** | Registers, Stack & Memory, Control Flow, Syscalls, Addressing |

10 additional languages via IR-based transpilation: C, C++, C#, Swift, PHP, Ruby, Dart, Lua, R.
Static patterns for HTML, CSS, and SQL.

### Adaptive Difficulty

PID controller adjusts difficulty per domain based on your WPM and accuracy. A calibration flow measures your baseline, then the system keeps you in the learning zone automatically.

### Ghost Racing

Race against 4 AI ghosts (Beginner 30 WPM, Intermediate 55 WPM, Expert 85 WPM, God 130 WPM) or your own personal best. Live delta tracking shows exactly how far ahead or behind you are.

### 4 Editor Themes

- **Dark Mode** — VS Code style with syntax highlighting
- **Terminal** — Green-on-black with block cursor
- **IDE** — Vim-style with tilde rows
- **Light Mode** — LeetCode-inspired clean layout

### Stats & Weakness Analysis

Track WPM, accuracy, and run counts per domain. A force-directed weakness cloud visualizes your trouble spots. Custom Run Builder lets you drill specific patterns.

### Import Your Own Code

Drag-and-drop files, folders, or ZIP archives. Paste a GitHub repo URL. Supports `.py`, `.rs`, `.js`, `.ts`, `.go`, `.java` files.

### Pattern Context Cards

Each pattern shows what it is, when to use it, and why it matters — learn the concepts while you type.

### Streamer Mode

Toggle an overlay HUD (`Ctrl+Shift+S`) showing live WPM, accuracy, ghost race status, and session stats — designed for stream overlays.

---

## Installation

### Desktop App (Recommended)

**Prerequisites:** [Node.js](https://nodejs.org/) v18+ and [Rust](https://rustup.rs/)

```bash
git clone https://github.com/abhinavsporika/patro.git
cd patro
npm install
npm run tauri dev
```

To build a distributable binary:

```bash
npm run tauri build
```

This produces a `.dmg` (macOS), `.msi` (Windows), or `.AppImage` (Linux) in `src-tauri/target/release/bundle/`.

### Browser (Local Client)

No Rust required — runs entirely in your browser with localStorage persistence.

```bash
git clone https://github.com/abhinavsporika/patro.git
cd patro
npm install
npm run dev
```

Open `http://localhost:1420` in your browser.

---

## Tech Stack

- **Frontend:** React 18 + TypeScript + Tailwind CSS
- **Desktop:** Tauri v2 (Rust)
- **Bundler:** Vite 5
- **Transpiler:** Custom IR-based two-stage pipeline (Python IR to 15 languages)
- **State:** localStorage — fully offline, zero backend

---

## Project Structure

```
patro/
  src/
    components/       # React UI components
    hooks/            # Custom React hooks (ghost, keystroke capture, click-outside)
    lib/
      transpiler/     # IR-based multi-language transpiler (types, parser, emitters)
      api.ts          # Unified Tauri/browser API layer
      browser-backend.ts  # In-browser pattern engine + PID controller
      language-worlds.ts  # 7 native language world configurations
      markup-patterns.ts  # Static HTML/CSS/SQL patterns
      seed-patterns.json  # 280 seed patterns (lazy-loaded)
    assets/           # App icons and images
  src-tauri/          # Rust desktop shell (Tauri v2)
```

---

## License

[Apache 2.0](LICENSE)
