# Features

Status feature setu GitArbora. `[x]` = zrobione, `[ ]` = planowane / brak, `[~]` = częściowe lub placeholder.

## 1. Repository Management

- [x] Switch repo at runtime (`REPO_CHANGED` IPC, reload całego stanu)
- [x] Per-repo settings (SQLite + Drizzle, `RepoSettings`)
- [x] Sidebar sections toggle (Branches / Remotes / Tags / Stashes)
- [x] Persist last selected commit i aktywny view
- [ ] Clone repository (z URL, wybór ścieżki, checkout brancha, recursive submodules)
- [ ] Init new local repository
- [ ] Add existing local repository (UI wyboru folderu)
- [ ] Bookmarks / repository browser (dashboard wszystkich repo)
- [ ] Multi-repo tabs (kilka repo otwartych w jednym oknie)
- [ ] Recent repositories list
- [ ] Create remote repository przy init (one-shot)

## 2. Working Copy / File Status

- [x] Staged / Unstaged split view (FileList + CommitPanel)
- [x] Stage / Unstage single file
- [x] Stage all / Unstage all
- [x] Stage hunk / Unstage hunk
- [x] Stage specific lines / Unstage specific lines
- [x] Discard file (honoruje untracked vs tracked)
- [x] Discard specific lines
- [x] Bulk discard / Bulk ignore (multi-select w FileList)
- [x] Add file to `.gitignore`
- [x] "Uncommitted" row w grafie gdy są zmiany
- [x] Open file in external app (`shell.openPath`)
- [x] Uncommitted count badge w top toolbarze
- [x] Detekcja renamed files (`ChangedFile.from`)
- [ ] Tree view dla listy plików (hierarchiczny foldery)
- [ ] Flat view toggle / multi-column flat mode
- [ ] File search wewnątrz list plików
- [ ] File type change detection (permissions, symlink)
- [ ] Clean working copy (`git clean -fd` z UI dla untracked)
- [ ] Mark as resolved po konflikcie
- [ ] Reveal in Finder/Explorer
- [ ] Launch external merge tool
- [ ] Launch external diff tool
- [ ] Drag-drop to stage/unstage
- [ ] Auto-refresh na zmiany w working tree (fsnotify)

## 3. Diff View

- [x] Unified diff viewer
- [x] Per-line selection (ctrl/shift multiselect)
- [x] Context menu na liniach diffu
- [x] Detekcja plików binarnych
- [x] Added / removed line background colors
- [x] Stage / unstage / discard wybranych linii
- [ ] Side-by-side / split view
- [ ] Syntax highlighting
- [ ] Word-level diff
- [ ] Ignore whitespace toggle
- [ ] Line wrapping toggle
- [ ] Copy diff / copy hunk to clipboard
- [ ] Show line numbers
- [ ] Binary preview (obrazy, PDF)

## 4. Commit

- [x] Create commit (multiline message)
- [x] Amend last commit (`--amend`)
- [x] Skip pre-commit hooks (`--no-verify`)
- [x] Auto-fill author z `git config`
- [x] Per-repo override author (`commit.authorName/authorEmail`)
- [x] "Push after commit" toggle
- [ ] Commit message history (pick from recent messages)
- [ ] Commit templates (global + per-repo, markdown)
- [ ] GPG signing (`-S`) z per-repo remember
- [ ] Paste image / drag-drop into commit message
- [ ] Dry-run pre-commit (preview co zostanie zacommitowane)

## 5. History / Log / Graph

- [x] Commit graph z multi-color lanes (incremental algorithm)
- [x] Uncommitted row na szczycie gdy są zmiany
- [x] Wirtualne scrollowanie (10k+ commitów płynnie)
- [x] Infinite scroll / load more (PAGE_SIZE=100)
- [x] Show all branches toggle
- [x] Date order / Topological order toggle
- [x] Relative dates ("5 minutes ago")
- [x] Ref badges inline (branch + tag na commit row)
- [x] Multi-color branches (kolor per lane)
- [x] Scroll to branch z sidebara
- [x] Resizable kolumny (Graph / Description / Hash / Author / Date)
- [x] Persist column widths per-repo
- [x] Horizontal scroll gdy kolumny szersze niż viewport
- [x] Copy SHA-1 to Clipboard
- [x] HEAD dot highlight z halo stroke
- [ ] Search commitów (po message / author / SHA / content pliku)
- [ ] Filter by author
- [ ] Filter by branch / tag
- [ ] Filter by date range
- [ ] File blame / annotate (per-line authorship)
- [ ] File history (`log --follow <path>`)
- [ ] Compare dwa commity
- [ ] Jump-to-commit by hash / short hash
- [ ] Avatary autorów (Gravatar / custom)
- [ ] Show commit signature verification status

## 6. Branches

- [x] List local + remote branches
- [x] Hierarchiczny tree-view z folderami (slash-separated)
- [x] Fuzzy search branch name
- [x] Ahead / behind counts per branch
- [x] Current branch highlight
- [x] Checkout branch (dblclick lub context menu)
- [x] Checkout remote branch (create local tracking)
- [x] Create branch (z HEAD lub z konkretnego commita)
- [x] Auto-checkout po create (opcjonalnie)
- [x] Branch z commit context menu (pre-fill start point)
- [x] Context menu: Merge / Rebase / New branch
- [ ] Rename branch
- [ ] Delete branch (soft + `-D` force)
- [ ] Multi-select delete branchy
- [ ] Set upstream / change tracked remote
- [ ] Compare dwa branche (diff range)
- [ ] Publish local branch (push + set-upstream jednym klikiem)
- [ ] Context menu brancha: Delete / Rename / Push / Set upstream
- [ ] "Show ahead/behind" wykres graficzny (nie tylko liczby)

## 7. Remotes

- [x] List remotes + remote branches w sidebarze
- [x] Remote URL w panelu
- [x] Pull (domyślnie)
- [x] Push (current branch)
- [x] Push multiple branches z `setUpstream` (`pushBranches`)
- [x] Push tags (w push dialogu)
- [x] Push specific revision (`<hash>:<branch>`, force-with-lease)
- [x] Fetch all
- [x] Push dialog (wybór brancha, include tags, remote URL)
- [x] Delete remote tag
- [ ] Add remote (UI)
- [ ] Edit remote URL (UI)
- [ ] Delete remote
- [ ] Pull with rebase option (UI)
- [ ] Fetch with prune option (UI)
- [ ] Delete remote branch (UI)
- [ ] Custom refspec configuration
- [ ] SSH key generation / pairing z remote
- [ ] HTTP credential caching (tokens / 2FA)
- [ ] Display last-fetched timestamp per remote

## 8. Merge

- [x] Merge branch → current
- [x] Merge commit z context menu (po SHA)
- [x] Detekcja konfliktów (`status.conflicted`)
- [x] Error dialog z listą skonfliktowanych plików
- [ ] Fast-forward only / No-ff / Squash toggle
- [ ] Edit merge commit message
- [ ] Auto-commit po udanym merge (opcja)
- [ ] Abort merge (`git merge --abort`)
- [ ] Continue merge po resolve (UI)
- [ ] Choose parent przy merge z multi-parent

## 9. Rebase

- [x] Rebase current onto branch / commit
- [x] Rebase z context menu commita
- [x] Detekcja konfliktów
- [ ] Interactive rebase (pick / reword / squash / fixup / drop / edit / reorder)
- [ ] Abort rebase (`git rebase --abort`)
- [ ] Continue rebase (`git rebase --continue`)
- [ ] Skip commit w rebase
- [ ] Rebase `--onto` (trójargumentowy)
- [ ] Autosquash (`fixup!` / `squash!` support)

## 10. Tags

- [x] List tags
- [x] Lightweight tag
- [x] Annotated tag (z message)
- [x] Delete local tag
- [x] Push tag do remote
- [x] Delete remote tag
- [x] Force create (move existing tag)
- [x] Tag z commit context menu
- [ ] GPG signed tags (`-s`)
- [ ] Push all tags at once
- [ ] Multi-select delete tagów

## 11. Stash

- [x] List stashes w sidebarze
- [x] Create stash (z message)
- [x] Keep index (`--keep-index`)
- [x] Apply stash (keep w liście)
- [x] Pop stash (apply + drop)
- [x] Stash conflicts detection
- [ ] Drop stash bez apply
- [ ] Include untracked (`--include-untracked`)
- [ ] Show stash diff (preview przed apply)
- [ ] Stash przy konkretnym commicie (nie tylko HEAD)

## 12. Reset / Revert / Cherry-pick

- [x] Reset soft / mixed / hard z commit context menu
- [x] Dedykowany Reset dialog (branch + commit + mode + hard warning)
- [x] Revert commit (`--no-edit`)
- [x] Revert dialog (confirm z commit preview)
- [x] Konflikty revert wykrywane
- [x] Cherry-pick commit z context menu
- [x] Cherry-pick dialog (confirm + target branch info)
- [x] Konflikty cherry-pick wykrywane
- [ ] Cherry-pick range (wiele commitów naraz)
- [ ] Cherry-pick `--no-commit` (zostaw w indexie)
- [ ] Choose parent przy cherry-pick merge commita
- [ ] Revert bez commita (`--no-commit`)

## 13. Advanced Git

- [x] Create Patch z working-copy file diff (`git diff`)
- [x] Create Patch z pojedynczego commita (`format-patch -1 --stdout`)
- [x] Archive commit do `.zip` / `.tar` (`git archive`)
- [ ] Apply patch file (`git apply`)
- [ ] Apply mailbox patch / email patch (`git am`)
- [ ] Patch dry-run validation
- [ ] Bisect workflow (start / good / bad / skip / reset / visualize)
- [ ] Reflog view (UI dla `git reflog`)
- [ ] Submodules (add / init / update / deinit / sync / remove, recursive)
- [ ] Subtrees (add / pull / push / split / merge, squash option)
- [ ] Git LFS (init / track / status / push-hook)
- [ ] Worktrees (add / list / remove)
- [ ] Sparse checkout
- [ ] Shallow clone
- [ ] Git-SVN (`git svn dcommit`, clone)
- [ ] Rewrite author on range (filter-branch / filter-repo)
- [ ] Git Flow (init / feature / release / hotfix / support)

## 14. UI / UX

- [x] Dark theme (custom CSS vars)
- [x] Resizable panels (sidebar / commit-log / file-list / diff) z cienkim dividerem + 4 px hit zone
- [x] Resizable + persistowane kolumny w commit log
- [x] Virtual scroll w liście commitów
- [x] Context menu na commitach (13 akcji w 4 sekcjach z separatorami)
- [x] Context menu na branchach (merge / rebase / new)
- [x] Context menu na plikach
- [x] Context menu na liniach diffu
- [x] Keyboard shortcuts: Escape zamyka dialogi, Enter potwierdza
- [x] Keyboard navigation w menu (↑↓ pomija separatory, Enter aktywuje)
- [x] Progress dialog dla operacji async (`withProgress` wrapper)
- [x] Error / Info dialog z szczegółami
- [x] Auto-select Uncommitted przy starcie jeśli są zmiany
- [x] Persist active view, last selected commit, panel sizes, column widths
- [x] Graf: delikatne linie (1.5 px), małe kropki, lane width 10 px
- [~] Terminal integration — akcja w toolbarze, handler stub
- [~] Settings panel — akcja w toolbarze, handler stub
- [ ] Light theme / theme switcher / auto z systemu
- [ ] Font family / font size customization
- [ ] Staging mode switcher (no-staging / fluid / split)
- [ ] Compact mode (gęstszy log)
- [ ] Line endings (CRLF/LF) handling UI
- [ ] Whitespace visualization toggle
- [ ] Custom actions (user-defined skrypty z parametrami i skrótami)
- [ ] Native menu bar (File / Edit / View / Repository / Actions / Tools)
- [ ] Auto-refresh on file change (fsnotify)
- [ ] Auto-refresh on remote change (periodic fetch)
- [ ] Notifications on operation complete
- [ ] Undo / Redo framework
- [ ] Repo browser (navigate pliki w konkretnym commicie)
- [ ] Internationalization / wybór locale
- [ ] Date locale / format preferences
- [ ] CLI companion (`arbor` z terminala otwiera repo w app)

## 15. Integracje z serwisami

- [ ] GitHub integration (OAuth, list PR, create PR, view checks)
- [ ] GitLab integration (OAuth, MR support)
- [ ] Bitbucket Cloud / Server integration
- [ ] Azure DevOps / VSTS integration
- [ ] Jira integration (smart commits, issue browser)
- [ ] Pull Request / Merge Request create z UI
- [ ] PR list / review wewnątrz app
- [ ] CI build status (checks per commit)
- [ ] Avatary autorów commitów
- [ ] 2FA / OAuth token management
- [ ] Keychain / credential manager integration
- [ ] Issue linking w commit message (auto-complete)

## 16. Platform / Dystrybucja

- [x] macOS (arm64 + x86_64) — MakerZIP
- [x] Windows — MakerSquirrel (.exe + nupkg + RELEASES)
- [x] Linux — MakerDeb (.deb) + MakerRpm (.rpm)
- [x] GitHub Actions release workflow (tag-triggered, 3-OS matrix)
- [x] Draft release z assetami dla każdej platformy
- [x] Sanityzacja nazw plików przed uploadem (spacje → myślniki)
- [ ] Auto-update (squirrel updater)
- [ ] MSI installer (Windows enterprise deployment)
- [ ] Silent install z preset konfiguracją
- [ ] Code signing (macOS notarization, Windows Authenticode)
- [ ] Telemetry / analytics (opt-in)

## 17. Developer tooling

- [x] Unit tests (Vitest, 131 passing)
- [x] E2E tests (Playwright + Electron, 128 passing)
- [x] Typecheck (`tsc --noEmit`)
- [x] Lint (ESLint + eslint-plugin-svelte)
- [x] Format (Prettier + prettier-plugin-svelte)
- [x] Test repo fixture (bare remote + realistyczna historia)
- [x] CI GitHub Actions (test.yml + release.yml)
- [x] `E2E_SAVE_PATH` env bypass dla native save-dialog w e2e
- [x] IPC mock helper (`showSaveDialog` wrapper)

---

## Świadomie odłożone (poza zakresem MVP)

- [ ] Mercurial (Hg) support — projekt jest git-only
- [ ] SVN support — niszowe, duża złożoność
- [ ] hgsubversion, hg-attic — j.w.
- [ ] Internationalization — dopiero po ustabilizowaniu core'a
