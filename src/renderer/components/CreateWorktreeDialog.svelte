<script lang="ts">
  import { onMount } from 'svelte';
  import type { Branch, Worktree } from '../../shared/ipc';

  type Props = {
    /** Currently-loaded branches (passed from App so we don't re-fetch). */
    branches: Branch[];
    /** Existing worktrees — used to disable branches already checked out. */
    worktrees: Worktree[];
    /** Path of the currently-open repo (used to derive the default
     *  parent directory for the new worktree). */
    currentRepoPath: string;
    /** Initial branch when launched from a branch context menu. */
    initialBranch?: string;
    onConfirm: (opts: {
      path: string;
      base: string;
      newBranch?: string;
    }) => void;
    onCancel: () => void;
  };

  let {
    branches,
    worktrees,
    currentRepoPath,
    initialBranch,
    onConfirm,
    onCancel,
  }: Props = $props();

  type Mode = 'existing' | 'new';
  let mode = $state<Mode>(initialBranch ? 'existing' : 'new');
  let existingBranch = $state(initialBranch ?? '');
  let newBranchName = $state('');
  let baseRef = $state(
    initialBranch ?? branches.find((b) => b.current)?.name ?? '',
  );
  let pathInput = $state('');

  /** Branches already used by another worktree — gated in the dropdown. */
  let busyBranches = $derived(
    new Set(
      worktrees
        .filter((w) => w.branch !== undefined)
        .map((w) => w.branch as string),
    ),
  );

  function slugify(s: string): string {
    return s
      .trim()
      .replace(/[/\\]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .toLowerCase();
  }

  function suggestPath(branch: string): string {
    const repoBase = currentRepoPath.replace(/\/+$/, '');
    const lastSlash = repoBase.lastIndexOf('/');
    const parent = lastSlash >= 0 ? repoBase.slice(0, lastSlash) : repoBase;
    const name = lastSlash >= 0 ? repoBase.slice(lastSlash + 1) : 'repo';
    const slug = slugify(branch) || 'worktree';
    return `${parent}/${name}-${slug}`;
  }

  // Auto-fill path when the chosen branch changes (unless user has typed
  // something custom — once dirty, we leave it alone).
  let pathDirty = $state(false);
  $effect(() => {
    if (pathDirty) return;
    const ref = mode === 'existing' ? existingBranch : newBranchName;
    if (ref) pathInput = suggestPath(ref);
  });

  onMount(() => {
    if (initialBranch) pathInput = suggestPath(initialBranch);
  });

  let canConfirm = $derived(
    pathInput.trim().length > 0 &&
      ((mode === 'existing' &&
        existingBranch &&
        !busyBranches.has(existingBranch)) ||
        (mode === 'new' && newBranchName.trim().length > 0 && baseRef)),
  );

  function handleConfirm() {
    if (!canConfirm) return;
    if (mode === 'existing') {
      onConfirm({ path: pathInput.trim(), base: existingBranch });
    } else {
      onConfirm({
        path: pathInput.trim(),
        base: baseRef,
        newBranch: newBranchName.trim(),
      });
    }
  }

  async function browse() {
    const dir = await window.electronAPI.repo.pickDirectory({
      title: 'Worktree directory',
      defaultPath: pathInput || undefined,
    });
    if (!dir) return;
    pathInput = dir;
    pathDirty = true;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onCancel();
    if (e.key === 'Enter' && canConfirm) handleConfirm();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="overlay" onclick={onCancel} role="dialog" aria-modal="true">
  <div class="dialog" onclick={(e) => e.stopPropagation()}>
    <h3 class="title">Create Worktree</h3>

    <div class="field-group">
      <label class="radio-row">
        <input type="radio" name="wt-mode" value="existing" bind:group={mode} />
        Use existing branch
      </label>
      {#if mode === 'existing'}
        <select
          class="indented input"
          bind:value={existingBranch}
          data-testid="worktree-existing-branch"
        >
          <option value="" disabled>Choose a branch…</option>
          {#each branches as b (b.name)}
            <option
              value={b.name}
              disabled={busyBranches.has(b.name) && b.name !== initialBranch}
            >
              {b.name}{busyBranches.has(b.name) ? ' (in another worktree)' : ''}
            </option>
          {/each}
        </select>
      {/if}

      <label class="radio-row">
        <input type="radio" name="wt-mode" value="new" bind:group={mode} />
        Create new branch
      </label>
      {#if mode === 'new'}
        <div class="indented">
          <input
            class="input"
            type="text"
            placeholder="new-branch-name"
            bind:value={newBranchName}
            data-testid="worktree-new-branch"
          />
          <div class="from-row">
            <span class="from-label">from</span>
            <select class="input" bind:value={baseRef}>
              {#each branches as b (b.name)}
                <option value={b.name}>{b.name}</option>
              {/each}
            </select>
          </div>
        </div>
      {/if}
    </div>

    <div class="field">
      <label for="worktree-path">Worktree path:</label>
      <div class="dir-row">
        <input
          id="worktree-path"
          class="input"
          type="text"
          bind:value={pathInput}
          oninput={() => (pathDirty = true)}
          data-testid="worktree-path-input"
        />
        <button type="button" class="browse" onclick={browse}>Browse…</button>
      </div>
    </div>

    <div class="actions">
      <button class="btn-cancel" onclick={onCancel}>Cancel</button>
      <button
        class="btn-primary"
        disabled={!canConfirm}
        onclick={handleConfirm}
        data-testid="worktree-create-confirm"
      >
        Create Worktree
      </button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .dialog {
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 20px;
    width: 480px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--color-text-white, var(--color-text-primary));
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .radio-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .radio-row input {
    accent-color: var(--color-text-accent);
  }

  .indented {
    margin-left: 24px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .from-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .from-label {
    font-size: 12px;
    color: var(--color-text-secondary);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field > label {
    font-size: 11px;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .input {
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 13px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }

  .input:focus {
    border-color: var(--color-text-accent);
  }

  .dir-row {
    display: flex;
    gap: 6px;
  }

  .browse {
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    padding: 5px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
  }

  .browse:hover {
    background: var(--color-bg-hover);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .btn-cancel {
    padding: 6px 24px;
    border: 1px solid var(--color-border);
    background: var(--color-bg-toolbar);
    color: var(--color-text-primary);
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
  }

  .btn-cancel:hover {
    background: var(--color-bg-hover);
  }

  .btn-primary {
    padding: 6px 24px;
    border: none;
    background: #0e639c;
    color: white;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    font-weight: 600;
  }

  .btn-primary:hover {
    background: #1177bb;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
