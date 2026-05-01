# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog 1.1](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.4] - 2026-05-01

### Fixed

- Missed prettier formatting on `forge.config.ts` (CI `format:check` guard).

## [0.8.3] - 2026-05-01

> **Note**: never published — CI `format:check` failed (fix shipped in 0.8.4).

### Fixed

- Linux RPM build failure caused by cross-arch native binaries — `forge.config.ts` `packageAfterCopy` now filters `@node-llama-cpp/*` subpackages by target platform/arch. RPM's `brp-strip` choked on `linux-arm64` `.node` files shipped in `linux-x64` builds.

## [0.8.2] - 2026-05-01

> **Note**: never published — CI Linux RPM build failed on cross-arch binaries (fix shipped in 0.8.3).

### Fixed

- Sidebar selector collision with `FileList` — renamed `.section-header-row` → `.worktree-section-header` on the Worktrees sidebar header (the duplicated class broke the staged-files e2e test).
- Sidebar selector collision with active-branch styling — renamed `.current-branch` → `.current-worktree` on worktree rows.

## [0.8.1] - 2026-05-01

> **Note**: never published — CI E2E failed on `.section-header-row` selector collision (fix shipped in 0.8.2).

## [0.8.0] - 2026-05-01

> **Note**: never published — CI E2E failed on `.current-branch` selector collision (fix shipped in 0.8.2).

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

[Unreleased]: https://github.com/johniak/gitarbor/compare/v0.8.4...HEAD
[0.8.4]: https://github.com/johniak/gitarbor/releases/tag/v0.8.4
[0.8.3]: https://github.com/johniak/gitarbor/releases/tag/v0.8.3
[0.8.2]: https://github.com/johniak/gitarbor/releases/tag/v0.8.2
[0.8.1]: https://github.com/johniak/gitarbor/releases/tag/v0.8.1
[0.8.0]: https://github.com/johniak/gitarbor/releases/tag/v0.8.0
[0.7.0]: https://github.com/johniak/gitarbor/releases/tag/v0.7.0
