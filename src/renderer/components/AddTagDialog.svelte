<script lang="ts">
  import type { Remote, Tag } from '../types';

  export type TagAction =
    | {
        mode: 'add';
        name: string;
        commit: string;
        message?: string;
        force: boolean;
        pushTo?: string;
      }
    | { mode: 'remove'; name: string; removeFromRemote?: string };

  type Props = {
    initialMode?: 'add' | 'remove';
    commitHash: string;
    commitSubject: string;
    tags: Tag[];
    remotes: Remote[];
    onConfirm: (action: TagAction) => void;
    onCancel: () => void;
  };

  let {
    initialMode = 'add',
    commitHash,
    commitSubject,
    tags,
    remotes,
    onConfirm,
    onCancel,
  }: Props = $props();

  let currentMode = $state<'add' | 'remove'>(initialMode);

  const TAG_NAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

  // ── Add state ───────────────────────────────────────────────
  let tagName = $state('');
  let commitMode = $state<'working' | 'specified'>('specified');
  let pushEnabled = $state(false);
  let pushRemote = $state<string>(
    remotes.find((r) => r.name === 'origin')?.name ?? remotes[0]?.name ?? '',
  );
  let advancedOpen = $state(false);
  let moveExisting = $state(false);
  let lightweight = $state(false);

  let shortHash = $derived(commitHash.slice(0, 7));
  let addValid = $derived(
    tagName.trim().length > 0 && TAG_NAME_REGEX.test(tagName.trim()),
  );

  // ── Remove state ────────────────────────────────────────────
  let removeTagName = $state<string>(tags[0]?.name ?? '');
  let removeFromRemoteEnabled = $state(false);
  let removeRemote = $state<string>(
    remotes.find((r) => r.name === 'origin')?.name ?? remotes[0]?.name ?? '',
  );

  let removeValid = $derived(removeTagName.trim().length > 0);

  // ── Submit ──────────────────────────────────────────────────
  function handleAdd() {
    if (!addValid) return;
    const name = tagName.trim();
    onConfirm({
      mode: 'add',
      name,
      commit: commitHash,
      message: lightweight ? undefined : name,
      force: moveExisting,
      pushTo: pushEnabled && pushRemote ? pushRemote : undefined,
    });
  }

  function handleRemove() {
    if (!removeValid) return;
    onConfirm({
      mode: 'remove',
      name: removeTagName,
      removeFromRemote:
        removeFromRemoteEnabled && removeRemote ? removeRemote : undefined,
    });
  }

  function handleConfirm() {
    if (currentMode === 'add') handleAdd();
    else handleRemove();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Enter') {
      // Only submit on Enter when focus is on an input (not textarea/button)
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT') {
        e.preventDefault();
        handleConfirm();
      }
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="overlay" onclick={onCancel} role="dialog" aria-modal="true">
  <div class="dialog" onclick={(e) => e.stopPropagation()}>
    <div class="header">
      <h3 class="title">
        {currentMode === 'add' ? 'Add Tag' : 'Remove Tag'}
      </h3>
      <div class="mode-tabs">
        <button
          type="button"
          class="mode-tab"
          class:active={currentMode === 'add'}
          data-testid="tag-mode-add"
          onclick={() => (currentMode = 'add')}
        >
          Add Tag
        </button>
        <button
          type="button"
          class="mode-tab"
          class:active={currentMode === 'remove'}
          data-testid="tag-mode-remove"
          onclick={() => (currentMode = 'remove')}
        >
          Remove Tag
        </button>
      </div>
    </div>

    {#if currentMode === 'add'}
      <div class="field">
        <label class="field-label" for="tag-name">Tag Name:</label>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          id="tag-name"
          class="input"
          type="text"
          placeholder="Tag name..."
          bind:value={tagName}
          data-testid="tag-name-input"
          autofocus
        />
        {#if tagName.trim() && !addValid}
          <span class="warn"
            >Must start with a letter or number; only A–Z, 0–9, ._/- allowed.</span
          >
        {/if}
      </div>

      <div class="field-group">
        <span class="field-label">Commit:</span>
        <label class="radio-row">
          <input
            type="radio"
            name="tag-commit-mode"
            value="working"
            disabled
            bind:group={commitMode}
          />
          Working copy parent
        </label>
        <label class="radio-row">
          <input
            type="radio"
            name="tag-commit-mode"
            value="specified"
            bind:group={commitMode}
          />
          Specified commit:
        </label>
        <div class="specified-row">
          <code class="commit-hash" data-testid="tag-commit-hash"
            >{shortHash}</code
          >
          {#if commitSubject}
            <span class="commit-subject">{commitSubject}</span>
          {/if}
          <button class="btn-pick" type="button" disabled>Pick…</button>
        </div>
      </div>

      {#if remotes.length > 0}
        <div class="push-row">
          <label class="checkbox-row">
            <input
              type="checkbox"
              bind:checked={pushEnabled}
              data-testid="tag-push-checkbox"
            />
            Push tag:
          </label>
          <select
            class="select"
            bind:value={pushRemote}
            disabled={!pushEnabled}
          >
            {#each remotes as r}
              <option value={r.name}>{r.name}</option>
            {/each}
          </select>
        </div>
      {/if}

      <button
        type="button"
        class="advanced-toggle"
        onclick={() => (advancedOpen = !advancedOpen)}
      >
        {advancedOpen ? '▾' : '▸'} Advanced Options
      </button>
      {#if advancedOpen}
        <div class="advanced-box">
          <label class="checkbox-row">
            <input
              type="checkbox"
              bind:checked={moveExisting}
              data-testid="tag-move-existing"
            />
            Move existing tag
          </label>
          <label class="checkbox-row">
            <input
              type="checkbox"
              bind:checked={lightweight}
              data-testid="tag-lightweight"
            />
            Lightweight tag (not recommended)
          </label>
          <label
            class="checkbox-row disabled-row"
            title="GPG signing not yet supported"
          >
            <input type="checkbox" disabled />
            Sign tag (key specified in repository settings)
          </label>
          <label
            class="field sign-message-field"
            title="GPG signing not yet supported"
          >
            <span class="field-label">Sign message:</span>
            <input class="input" type="text" disabled />
          </label>
        </div>
      {/if}
    {:else}
      <div class="field">
        <label class="field-label" for="remove-tag-select">Tag:</label>
        {#if tags.length === 0}
          <span class="warn">No tags to remove in this repository.</span>
        {:else}
          <select
            id="remove-tag-select"
            class="select"
            bind:value={removeTagName}
            data-testid="tag-remove-select"
          >
            {#each tags as t}
              <option value={t.name}>{t.name}</option>
            {/each}
          </select>
        {/if}
      </div>

      {#if remotes.length > 0 && tags.length > 0}
        <div class="push-row">
          <label class="checkbox-row">
            <input
              type="checkbox"
              bind:checked={removeFromRemoteEnabled}
              data-testid="tag-remove-from-remote"
            />
            Remove from remote:
          </label>
          <select
            class="select"
            bind:value={removeRemote}
            disabled={!removeFromRemoteEnabled}
          >
            {#each remotes as r}
              <option value={r.name}>{r.name}</option>
            {/each}
          </select>
        </div>
      {/if}
    {/if}

    <div class="actions">
      <button class="btn-cancel" onclick={onCancel}>Cancel</button>
      {#if currentMode === 'add'}
        <button
          class="btn-primary"
          disabled={!addValid}
          data-testid="tag-submit-add"
          onclick={handleAdd}
        >
          Add
        </button>
      {:else}
        <button
          class="btn-primary"
          disabled={!removeValid}
          data-testid="tag-submit-remove"
          onclick={handleRemove}
        >
          Remove
        </button>
      {/if}
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
    width: 500px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--color-text-white);
  }

  .mode-tabs {
    display: flex;
    gap: 4px;
  }

  .mode-tab {
    border: 1px solid var(--color-border);
    background: var(--color-bg-toolbar);
    color: var(--color-text-secondary);
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
  }

  .mode-tab:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .mode-tab.active {
    background: var(--color-bg-selected);
    color: var(--color-text-accent);
    border-color: var(--color-text-accent);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-label {
    font-size: 11px;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .input {
    background: var(--color-bg-base);
    border: 2px solid var(--color-text-accent);
    color: var(--color-text-primary);
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 13px;
    outline: none;
  }

  .input:disabled {
    opacity: 0.4;
    border-color: var(--color-border);
    cursor: not-allowed;
  }

  .select {
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 13px;
    outline: none;
  }

  .select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .warn {
    font-size: 11px;
    color: #d16a6a;
    padding-left: 2px;
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
    padding-left: 4px;
  }

  .radio-row input {
    accent-color: var(--color-text-accent);
  }

  .specified-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 24px;
  }

  .commit-hash {
    font-family: monospace;
    font-size: 12px;
    color: var(--color-text-primary);
    background: var(--color-bg-base);
    padding: 3px 6px;
    border-radius: 3px;
    border: 1px solid var(--color-border);
  }

  .commit-subject {
    font-size: 12px;
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 260px;
  }

  .btn-pick {
    padding: 3px 10px;
    font-size: 11px;
    background: var(--color-bg-toolbar);
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    cursor: not-allowed;
    opacity: 0.5;
  }

  .push-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .push-row .select {
    flex: 1;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .checkbox-row.disabled-row {
    color: var(--color-text-secondary);
    cursor: not-allowed;
  }

  .checkbox-row input {
    accent-color: var(--color-text-accent);
  }

  .advanced-toggle {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    padding: 0;
  }

  .advanced-toggle:hover {
    color: var(--color-text-primary);
  }

  .advanced-box {
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sign-message-field {
    margin-top: 4px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
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
