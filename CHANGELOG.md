# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog 1.1](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.10.1] - 2026-05-04

### Fixed

- Packaged builds (deb / rpm / dmg / zip) crashed on first import with `ERR_MODULE_NOT_FOUND` for `lifecycle-utils` (and would have failed for ~20 more transitives like `@huggingface/jinja`, `async-retry`, `cmake-js`, `ipull`, `ora`, `semver`, `yargs`). The Forge `packageAfterCopy` hook copied only the top-level externals named in `EXTERNAL_MODULES`, missing every transitive that resolves through Bun's hoisted top-level `node_modules`. Replaced the shallow copy with a recursive walker that mirrors Node's resolution (nested `node_modules` first, then project root) and follows `dependencies` only — `optionalDependencies` stay excluded so the per-platform `@node-llama-cpp/<platform>` binaries still ship one OS at a time.

## [0.10.0] - 2026-05-04

### Added

- Sourcetree-style Pull dialog: remote dropdown + read-only URL, remote-branch dropdown with a Refresh button (runs `git fetch`), local branch row, and four mutually-aware option checkboxes — Commit merged changes immediately (`--no-commit` when off), Include messages from commits being merged in merge commit (`--log`), Create new commit even if fast-forward merge (`--no-ff`), Rebase instead of merge (`--rebase`, disables the merge-only flags). Defaults persist in `AppSettings.pull` (schema 5 → 6, deep-merge upgrade). 13 e2e tests added.

## [0.9.0] - 2026-05-01

### Added

- Side-by-side diff view, toggleable from a new toolbar in every DiffViewer mount site (file-status, history, file log, interactive rebase). Per-line staging stays unified-only in v1; hunk-level Stage/Unstage works in both modes.
- Syntax highlighting in diffs via Shiki — TypeScript, JavaScript, Python, Go, Rust, Java, Kotlin, Svelte, CSS, HTML, JSON, YAML, shell, Markdown.
- Word-level diff for paired modification lines (`-` immediately followed by `+`); changed words are highlighted instead of the whole line.
- Settings → Diff tab with persistent app-wide preferences (view mode, syntax highlight, word diff) in `AppSettings.diff` (schema 4 → 5, deep-merge upgrade for v4 files).

## [0.8.4] - 2026-05-01

### Added

- Local AI inference via `node-llama-cpp`: curated model list (Qwen 2.5 Coder 1.5B/3B, Qwen 3.5 0.8B, DeepSeek Coder 1.3B, Gemma 2 2B, Llama 3.2 3B, Phi 3.5-mini), GGUF download with magic-byte validation, GPU auto-detection (Metal / CUDA / Vulkan / CPU), idle eviction with a "Keep model loaded" toggle.
- Coding Agent provider — spawns the locally-installed `claude` (Claude Code) or `codex` (Codex CLI) subprocess; parses `stream-json` deltas; cancels with SIGTERM → SIGKILL.
- OpenAI-compatible provider — chat-completions SSE streaming with configurable base URL, model, and API key. Works with OpenAI, OpenRouter, Groq, Together, vLLM, LM Studio, and Ollama in compat mode.
- AI source picker in Settings (Local LLM / Coding Agent / OpenAI-compatible) with a per-source readiness probe gating the Generate buttons.
- "Generate with AI" buttons in the Create Branch dialog and Commit Panel — streaming token output with a Cancel control and a "Thinking…" indicator until the first token arrives.
- Worktrees sidebar section + tab bar (only shown when 2+ tabs are open).
- Create / Lock / Unlock / Remove worktree dialogs with a force-checkbox gate when the worktree is dirty or locked.
- "Create worktree from `<branch>`…" entry in the branch context menu.
- Ephemeral repo-open path so worktree tab switches don't pollute Recent Repositories.

## [0.7.0] - 2026-04-29

### Added

- File log + annotate dialogs — per-file commit history (`git log --follow <path>`) and per-line blame view, both reachable from file context menus.

[Unreleased]: https://github.com/johniak/gitarbor/compare/v0.10.1...HEAD
[0.10.1]: https://github.com/johniak/gitarbor/releases/tag/v0.10.1
[0.10.0]: https://github.com/johniak/gitarbor/releases/tag/v0.10.0
[0.9.0]: https://github.com/johniak/gitarbor/releases/tag/v0.9.0
[0.8.4]: https://github.com/johniak/gitarbor/releases/tag/v0.8.4
[0.7.0]: https://github.com/johniak/gitarbor/releases/tag/v0.7.0
