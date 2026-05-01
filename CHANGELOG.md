# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog 1.1](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/johniak/gitarbor/compare/v0.8.4...HEAD
[0.8.4]: https://github.com/johniak/gitarbor/releases/tag/v0.8.4
[0.7.0]: https://github.com/johniak/gitarbor/releases/tag/v0.7.0
