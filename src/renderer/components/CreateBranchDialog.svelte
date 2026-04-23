<script lang="ts">
  type Props = {
    currentBranch: string;
    onConfirm: (
      name: string,
      startPoint: string | undefined,
      checkout: boolean,
    ) => void;
    onCancel: () => void;
  };

  let { currentBranch, onConfirm, onCancel }: Props = $props();

  let branchName = $state('');
  let commitMode = $state<'working' | 'specified'>('working');
  let specifiedCommit = $state('');
  let checkoutAfter = $state(true);

  let slug = $derived(
    branchName
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9/._-]/g, '')
      .toLowerCase(),
  );

  function handleConfirm() {
    const name = slug;
    if (!name) return;
    const startPoint =
      commitMode === 'specified' && specifiedCommit.trim()
        ? specifiedCommit.trim()
        : undefined;
    onConfirm(name, startPoint, checkoutAfter);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onCancel();
    if (e.key === 'Enter') handleConfirm();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="overlay" onclick={onCancel} role="dialog" aria-modal="true">
  <div class="dialog" onclick={(e) => e.stopPropagation()}>
    <h3 class="title">New Branch</h3>

    <div class="field">
      <span class="field-label">Current branch</span>
      <div class="current-branch">{currentBranch}</div>
    </div>

    <div class="field">
      <label class="field-label" for="branch-name">New Branch:</label>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        id="branch-name"
        class="input"
        type="text"
        placeholder="Branch name..."
        bind:value={branchName}
        autofocus
      />
      {#if branchName.trim()}
        <span class="slug-preview">{slug}</span>
      {/if}
    </div>

    <div class="field-group">
      <span class="field-label">Commit:</span>
      <label class="radio-row">
        <input
          type="radio"
          name="commit-mode"
          value="working"
          bind:group={commitMode}
        />
        Working copy parent
      </label>
      <label class="radio-row">
        <input
          type="radio"
          name="commit-mode"
          value="specified"
          bind:group={commitMode}
        />
        Specified commit:
      </label>
      {#if commitMode === 'specified'}
        <input
          class="input commit-input"
          type="text"
          placeholder="Commit hash..."
          bind:value={specifiedCommit}
        />
      {/if}
    </div>

    <label class="checkbox-row">
      <input type="checkbox" bind:checked={checkoutAfter} />
      Checkout new branch
    </label>

    <div class="actions">
      <button class="btn-cancel" onclick={onCancel}>Cancel</button>
      <button class="btn-primary" disabled={!slug} onclick={handleConfirm}>
        Create Branch
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
    width: 440px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--color-text-white);
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

  .current-branch {
    padding: 6px 8px;
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    font-size: 13px;
    color: var(--color-text-primary);
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

  .slug-preview {
    font-size: 11px;
    color: var(--color-text-secondary);
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

  .commit-input {
    margin-left: 24px;
    width: calc(100% - 24px);
    box-sizing: border-box;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .checkbox-row input {
    accent-color: var(--color-text-accent);
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
