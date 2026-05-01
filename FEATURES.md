# Features

GitArbor feature matrix. `[x]` = done, `[ ]` = planned / missing, `[~]` = partial or placeholder.

## 1. Repository Management

- [x] Switch repo at runtime (`REPO_CHANGED` IPC, full state reload)
- [x] Per-repo settings (SQLite + Drizzle, `RepoSettings`)
- [x] App-wide settings (`app-settings.json`)
- [x] Sidebar sections toggle (Branches / Remotes / Tags / Stashes)
- [x] Persist last selected commit and active view
- [x] Clone repository from URL (Repository Browser → Clone from URL)
- [x] Init new local repository (Repository Browser → Create Local)
- [x] Add existing local repository (Repository Browser → Add Existing)
- [x] Scan directory for repositories (Repository Browser → Scan Directory)
- [x] Bookmarks / repository browser (separate window listing favourite repos)
- [x] Recent repositories list (system menu Repositories → Recent)
- [x] Default project folder (Settings → Miscellaneous, pre-fills Clone / Create Local pickers)
- [ ] Clone with advanced options (depth, branch, recursive submodules)
- [ ] Multi-repo tabs (multiple repos open in one window)
- [ ] Create remote repository during init (one-shot)

## 2. Working Copy / File Status

- [x] Staged / Unstaged split view (FileList + CommitPanel)
- [x] Stage / Unstage single file
- [x] Stage all / Unstage all
- [x] Stage hunk / Unstage hunk
- [x] Stage specific lines / Unstage specific lines
- [x] Discard file (honours untracked vs tracked)
- [x] Discard specific lines
- [x] Bulk discard / Bulk ignore (multi-select in FileList)
- [x] Add file to `.gitignore`
- [x] "Uncommitted" row in graph when there are changes
- [x] Open file in external app (`shell.openPath`)
- [x] Uncommitted count badge in top toolbar
- [x] Renamed file detection (`ChangedFile.from`)
- [x] Tree view for file list (hierarchical folders, JetBrains-style middle-dir compaction)
- [x] Flat view toggle / multi-column flat mode (single column / 2-col grid / tree)
- [x] Show-only filter (Pending / Conflicts / Untracked / Modified — Ignored/Clean/All-files menu items present, disabled until backed by IPC)
- [x] Sort modes (Path ↑↓, File name ↑↓, File status, Checked/unchecked)
- [ ] File search within file lists
- [ ] File type change detection (permissions, symlinks)
- [ ] Clean working copy (`git clean -fd` UI for untracked)
- [x] Mark as resolved after conflict
- [x] Reveal in Finder / Explorer
- [ ] Launch external merge tool
- [ ] Launch external diff tool
- [ ] Drag-drop to stage / unstage
- [ ] Auto-refresh on working-tree changes (fsnotify)

## 3. Diff View

- [x] Unified diff viewer
- [x] Per-line selection (ctrl / shift multi-select)
- [x] Context menu on diff lines
- [x] Binary file detection
- [x] Added / removed line background colors
- [x] Stage / unstage / discard selected lines
- [ ] Side-by-side / split view
- [ ] Syntax highlighting
- [ ] Word-level diff
- [ ] Ignore whitespace toggle
- [ ] Line wrapping toggle
- [ ] Copy diff / copy hunk to clipboard
- [ ] Show line numbers
- [ ] Binary preview (images, PDF)

## 4. Commit

- [x] Create commit (multi-line message)
- [x] Amend last commit (`--amend`)
- [x] Skip pre-commit hooks (`--no-verify`)
- [x] Auto-fill author from `git config`
- [x] Per-repo author override (`commit.authorName/authorEmail`)
- [x] App-level author override on commits (Settings → General, passed via `-c user.name/email`; never writes to global config)
- [x] "Push after commit" toggle
- [ ] Commit message history (pick from recent messages)
- [ ] Commit templates (global + per-repo, markdown)
- [ ] GPG signing (`-S`) with per-repo remember
- [ ] Paste image / drag-drop into commit message
- [ ] Dry-run pre-commit (preview of what would be committed)

## 5. History / Log / Graph

- [x] Commit graph with multi-color lanes (incremental algorithm)
- [x] Uncommitted row at top when there are changes
- [x] Virtual scrolling (10k+ commits smoothly)
- [x] Infinite scroll / load more (PAGE_SIZE=100)
- [x] Show all branches toggle
- [x] Date order / Topological order toggle
- [x] Relative dates ("5 minutes ago")
- [x] Ref badges inline (branch + tag on commit row)
- [x] Multi-color branches (one color per lane)
- [x] Scroll to branch from sidebar
- [x] Resizable columns (Graph / Description / Hash / Author / Date)
- [x] Persist column widths per-repo
- [x] Horizontal scroll when columns exceed viewport
- [x] Copy SHA-1 to Clipboard
- [x] HEAD dot highlight with halo stroke
- [x] Merge commits show changed files (diff vs first parent)
- [x] Selection survives alt-tab / window refocus
- [x] Search commits (dedicated Search view; by message / author / SHA / file content; date range filter)
- [ ] Filter by author
- [ ] Filter by branch / tag
- [x] Filter by date range (in Search view, From / To)
- [x] File blame / annotate (per-line authorship)
- [x] File history (`log --follow <path>`)
- [ ] Compare two commits
- [ ] Jump-to-commit by hash / short hash
- [ ] Author avatars (Gravatar / custom)
- [ ] Show commit signature verification status

## 6. Branches

- [x] List local + remote branches
- [x] Hierarchical tree view with folders (slash-separated)
- [x] Fuzzy branch name search
- [x] Ahead / behind counts per branch
- [x] Current branch highlight
- [x] Checkout branch (dblclick or context menu)
- [x] Checkout remote branch (creates local tracking branch)
- [x] Create branch (from HEAD or a specific commit)
- [x] Auto-checkout after create (optional)
- [x] Branch from commit context menu (pre-filled start point)
- [x] Context menu: Merge / Rebase / New branch / Delete
- [x] Delete branch (soft + `-D` force) — confirm dialog with force toggle
- [ ] Rename branch
- [ ] Multi-select delete branches
- [ ] Set upstream / change tracked remote
- [ ] Compare two branches (diff range)
- [ ] Publish local branch (push + set-upstream in one click)
- [ ] Branch context menu: Delete / Rename / Push / Set upstream
- [ ] "Show ahead/behind" graphical bar (not just numbers)

## 7. Remotes

- [x] List remotes + remote branches in sidebar
- [x] Remote URL shown in panel
- [x] Pull (default)
- [x] Push (current branch)
- [x] Push multiple branches with `setUpstream` (`pushBranches`)
- [x] Push tags (inside the push dialog)
- [x] Push specific revision (`<hash>:<branch>`, force-with-lease)
- [x] Fetch all
- [x] Push dialog (branch picker, include tags, remote URL)
- [x] Delete remote tag
- [ ] Add remote (UI)
- [ ] Edit remote URL (UI)
- [ ] Delete remote
- [ ] Pull with rebase option (UI)
- [ ] Fetch with prune option (UI)
- [ ] Delete remote branch (UI)
- [ ] Custom refspec configuration
- [ ] SSH key generation / pairing with remote
- [ ] HTTP credential caching (tokens / 2FA)
- [ ] Display last-fetched timestamp per remote

## 8. Merge

- [x] Merge branch → current
- [x] Merge commit from context menu (by SHA)
- [x] Conflict detection (`status.conflicted`)
- [x] Error dialog with list of conflicted files
- [x] Conflict banner with operation kind + counter + Abort button
- [x] Per-file resolve: ours / theirs (auto-flipped during rebase)
- [x] Per-file mark resolved / mark unresolved
- [x] Abort merge (`git merge --abort`)
- [x] Continue merge after resolve (Commit button in conflict banner)
- [ ] Fast-forward only / No-ff / Squash toggle
- [ ] Edit merge commit message
- [ ] Auto-commit after successful merge (option)
- [ ] Choose parent when merging multi-parent

## 9. Rebase

- [x] Rebase current onto branch / commit
- [x] Rebase from commit context menu
- [x] Conflict detection
- [x] Abort rebase (`git rebase --abort`)
- [x] Continue rebase (`git rebase --continue` via conflict banner)
- [x] Interactive rebase (pick / drop / reword / edit / squash / reorder via ▲▼) — modal mirrors SourceTree's "Reorder and amend commits", reuses DiffViewer for read-only per-commit preview; conflicts surface through the existing ConflictBanner + Continue/Abort flow
- [ ] Skip commit in rebase
- [ ] Rebase `--onto` (three-argument)
- [ ] Autosquash (`fixup!` / `squash!` support)

## 10. Tags

- [x] List tags
- [x] Lightweight tag
- [x] Annotated tag (with message)
- [x] Delete local tag
- [x] Push tag to remote
- [x] Delete remote tag
- [x] Force create (move existing tag)
- [x] Tag from commit context menu
- [ ] GPG signed tags (`-s`)
- [ ] Push all tags at once
- [ ] Multi-select delete tags

## 11. Stash

- [x] List stashes in sidebar
- [x] Create stash (with message)
- [x] Keep index (`--keep-index`)
- [x] Apply stash (keep in list)
- [x] Pop stash (apply + drop)
- [x] Stash conflict detection
- [ ] Drop stash without apply
- [ ] Include untracked (`--include-untracked`)
- [ ] Show stash diff (preview before apply)
- [ ] Stash against a specific commit (not just HEAD)

## 12. Reset / Revert / Cherry-pick

- [x] Reset soft / mixed / hard from commit context menu
- [x] Dedicated Reset dialog (branch + commit + mode + hard warning)
- [x] Revert commit (`--no-edit`)
- [x] Revert dialog (confirm with commit preview)
- [x] Revert conflict detection
- [x] Cherry-pick commit from context menu
- [x] Cherry-pick dialog (confirm + target branch info)
- [x] Cherry-pick conflict detection
- [ ] Cherry-pick range (multiple commits at once)
- [ ] Cherry-pick `--no-commit` (leave in index)
- [ ] Choose parent when cherry-picking a merge commit
- [ ] Revert without commit (`--no-commit`)

## 13. Advanced Git

- [x] Create Patch from working-copy file diff (`git diff`)
- [x] Create Patch from a single commit (`format-patch -1 --stdout`)
- [x] Archive commit to `.zip` / `.tar` (`git archive`)
- [ ] Apply patch file (`git apply`)
- [ ] Apply mailbox / email patch (`git am`)
- [ ] Patch dry-run validation
- [ ] Bisect workflow (start / good / bad / skip / reset / visualize)
- [ ] Reflog view (UI over `git reflog`)
- [ ] Submodules (add / init / update / deinit / sync / remove, recursive)
- [ ] Subtrees (add / pull / push / split / merge, squash option)
- [ ] Git LFS (init / track / status / push-hook)
- [x] Worktrees — sidebar section + tab bar (1 tab = no chrome; 2+ shows tabs); double-click to open as tab; right-click → Lock / Unlock / Copy path / Remove (force-checkbox gate when dirty / locked); auto-open new tab on Create; "Create worktree from <branch>" in branch context menu; ephemeral repo open so worktree paths don't pollute Recent Repositories
- [ ] Sparse checkout
- [ ] Shallow clone
- [ ] Rewrite author on a range (filter-branch / filter-repo)
- [ ] Git Flow (init / feature / release / hotfix / support)

## 14. UI / UX

- [x] Dark theme (custom CSS vars)
- [x] Resizable panels (sidebar / commit-log / file-list / diff) with thin dividers + 4 px hit zone
- [x] Resizable + persisted columns in commit log
- [x] Virtual scroll in commit list
- [x] Context menu on commits (13 actions across 4 sections with separators)
- [x] Context menu on branches (merge / rebase / new)
- [x] Context menu on files
- [x] Context menu on diff lines
- [x] Keyboard shortcuts: Escape closes dialogs, Enter confirms
- [x] Keyboard navigation in menus (↑↓ skips separators, Enter activates)
- [x] Progress dialog for async operations (`withProgress` wrapper)
- [x] Error / Info dialog with details
- [x] Auto-select Uncommitted at startup when changes exist
- [x] Persist active view, last selected commit, panel sizes, column widths
- [x] Graph: subtle lines (1.5 px), small dots, lane width 10 px
- [x] Refreshed graph palette (bright blue / coral / emerald / amber / teal / violet)
- [x] Settings window (General tab: author override, default user info, project folder; seven roadmap tabs shown grayed)
- [x] Window > Show Repository Browser menu entry (`Cmd+Shift+O`)
- [x] Cmd+, / Ctrl+, opens Settings window
- [x] Main window title follows the repo directory name
- [x] Terminal integration — toolbar opens platform-native terminal in repo cwd
- [x] Light theme / theme switcher / auto from system (Settings → Appearance: System / Light / Dark; Electron `nativeTheme` so native chrome follows; cross-window propagation; anti-FOUC localStorage paint)
- [ ] Font family / font size customization
- [x] Staging mode switcher (no-staging / fluid / split — `git commit -A` with per-file Exclude in no-staging mode)
- [ ] Compact mode (denser log)
- [ ] Line endings (CRLF / LF) handling UI
- [ ] Whitespace visualization toggle
- [ ] Custom actions (user-defined scripts with parameters and shortcuts)
- [ ] Native menu bar (File / Edit / View / Repository / Actions / Tools)
- [ ] Auto-refresh on file change (fsnotify)
- [ ] Auto-refresh on remote change (periodic fetch)
- [ ] Notifications on operation complete
- [ ] Undo / Redo framework
- [ ] Repo browser (navigate files at a specific commit)
- [ ] Internationalization / locale picker
- [ ] Date locale / format preferences
- [ ] CLI companion (`arbor` command opens a repo in the app)

## 15. Hosting service integrations

- [ ] GitHub integration (OAuth, list PR, create PR, view checks)
- [ ] GitLab integration (OAuth, MR support)
- [ ] Bitbucket Cloud / Server integration
- [ ] Azure DevOps / VSTS integration
- [ ] Jira integration (smart commits, issue browser)
- [ ] Pull Request / Merge Request creation from UI
- [ ] PR list / review inside the app
- [ ] CI build status (checks per commit)
- [ ] Commit author avatars
- [ ] 2FA / OAuth token management
- [ ] Keychain / credential manager integration
- [ ] Issue linking in commit message (auto-complete)

## 16. Platform / Distribution

- [x] macOS (arm64 + x86_64) — MakerZIP
- [x] Windows — MakerSquirrel (.exe + nupkg + RELEASES)
- [x] Linux — MakerDeb (.deb) + MakerRpm (.rpm)
- [x] GitHub Actions release workflow (tag-triggered, 3-OS matrix)
- [x] Draft release with per-platform assets
- [x] Asset filename sanitization before upload (spaces → dashes)
- [ ] Auto-update (squirrel updater)
- [ ] MSI installer (Windows enterprise deployment)
- [ ] Silent install with preset config
- [ ] Code signing (macOS notarization, Windows Authenticode)
- [ ] Telemetry / analytics (opt-in)

## 17. AI

- [x] AI source picker in Settings: Local LLM / Coding Agent / OpenAI-compatible (single global active source for all AI features)
- [x] Local LLM via `node-llama-cpp` — auto GPU detection (Metal / CUDA / Vulkan / CPU fallback), curated model list (Qwen 2.5 Coder 1.5B / 3B, Qwen 3.5 0.8B, DeepSeek Coder 1.3B, Gemma 2 2B, Llama 3.2 3B, Phi 3.5-mini), Custom GGUF URL with magic-byte validation, inline determinate download progress with cancel
- [x] "Keep model loaded" toggle (pin in memory all session vs lazy-load on commit/branch view entry, 5-min idle eviction)
- [x] Coding Agent provider — spawns local `claude` (Claude Code) or `codex` (Codex CLI) subprocess in repo cwd; parses stream-json / `--json` deltas; SIGTERM → SIGKILL on cancel
- [x] OpenAI-compatible provider — native fetch + SSE against `/v1/chat/completions`; works with OpenAI, OpenRouter, Groq, Together, vLLM, LM Studio, Ollama (compat mode); base URL + model + API key
- [x] Source readiness probe (`✓ Ready` / `✗ <reason>` per source) gating Generate buttons
- [x] Generate branch name (Create Branch dialog) — context: recent commit subjects + current branch + start-point + working-tree summary with sample diff
- [x] Generate commit message (Commit Panel) — context: full staged diff (truncated to ~12 KB across files, ~4 KB per file, head/tail-elided hunks, binary/lockfile deny-list) + last 5 commit subjects for style mimicry
- [x] Streaming token render with race-free renderer-generated requestId
- [x] Cancel mid-stream + "Thinking…" indicator until first token
- [ ] Per-feature source picker (different source for branch name vs commit message)
- [ ] Custom HTTP headers / organization id for OpenAI-compatible
- [ ] Persistence of open worktree tabs across sessions
- [ ] Test connection button for OpenAI-compatible endpoints
- [ ] Explain diff / explain commit
- [ ] Generate PR description

## 18. Developer tooling

- [x] Unit tests (Vitest, 279 passing)
- [x] E2E tests (Playwright + Electron, 134 passing)
- [x] Typecheck (`tsc --noEmit`)
- [x] Lint (ESLint + eslint-plugin-svelte)
- [x] Format (Prettier + prettier-plugin-svelte)
- [x] Test repo fixture (bare remote + realistic history)
- [x] CI GitHub Actions (test.yml + release.yml)
- [x] `E2E_SAVE_PATH` env bypass for native save dialogs in e2e
- [x] `E2E_PICK_DIRECTORY` env bypass for native folder pickers in e2e
- [x] Per-test `--user-data-dir` isolation for Repository Browser e2e

---

## Explicitly out of scope

- 🚫 Mercurial (Hg) support — project is git-only, not planned
- 🚫 SVN support (`git svn dcommit`, clone) — not planned

## Deferred (may come later)

- [ ] Internationalization — only after core stabilises
