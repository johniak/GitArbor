<script lang="ts">
  type Props = {
    defaultDestPath?: string;
    onConfirm: (args: { url: string; destPath: string; name: string }) => void;
    onCancel: () => void;
  };

  let { defaultDestPath = '', onConfirm, onCancel }: Props = $props();

  let url = $state('');
  let destPath = $state(defaultDestPath);
  let name = $state('');
  let advancedOpen = $state(false);

  let derivedName = $derived.by(() => {
    if (name.trim().length > 0) return name.trim();
    const match = url.trim().match(/([^/]+?)(?:\.git)?\/?$/);
    return match ? match[1] : '';
  });

  let urlValid = $derived.by(() => {
    const u = url.trim();
    if (u.length === 0) return false;
    return (
      /^https?:\/\//i.test(u) ||
      /^git@/.test(u) ||
      /^ssh:\/\//i.test(u) ||
      /^git:\/\//i.test(u) ||
      /^file:\/\//i.test(u) ||
      u.startsWith('/')
    );
  });

  let destValid = $derived(destPath.trim().length > 0);
  let formValid = $derived(urlValid && destValid);

  async function pickDest() {
    const dir = await window.electronAPI.repo.pickDirectory({
      title: 'Destination Folder',
      defaultPath: destPath || defaultDestPath || undefined,
    });
    if (dir) destPath = dir;
  }

  function handleConfirm() {
    if (!formValid) return;
    // Final destination = destPath / derivedName (per-repo subfolder)
    const separator = destPath.endsWith('/') ? '' : '/';
    const final = `${destPath}${separator}${derivedName}`;
    onConfirm({ url: url.trim(), destPath: final, name: derivedName });
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Enter') {
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
    <h3 class="title">Clone a repository</h3>

    <div class="field">
      <label class="label" for="clone-url">Source URL:</label>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        id="clone-url"
        class="input"
        type="text"
        placeholder="https://github.com/owner/repo.git"
        bind:value={url}
        data-testid="clone-url"
        autofocus
      />
    </div>

    <div class="field">
      <label class="label" for="clone-dest">Destination Path:</label>
      <div class="dest-row">
        <input
          id="clone-dest"
          class="input"
          type="text"
          placeholder="Parent folder"
          bind:value={destPath}
          data-testid="clone-dest"
        />
        <button type="button" class="browse" title="Browse…" onclick={pickDest}>
          …
        </button>
      </div>
    </div>

    <div class="field">
      <label class="label" for="clone-name">Name:</label>
      <input
        id="clone-name"
        class="input"
        type="text"
        placeholder={derivedName || 'auto from URL'}
        bind:value={name}
        data-testid="clone-name"
      />
    </div>

    <button
      type="button"
      class="advanced-toggle"
      onclick={() => (advancedOpen = !advancedOpen)}
    >
      {advancedOpen ? '▾' : '▸'} Advanced Options
    </button>
    {#if advancedOpen}
      <div class="advanced-box">
        <p class="hint">Depth, branch and credential options coming soon.</p>
      </div>
    {/if}

    {#if url.trim() && !urlValid}
      <p class="warn" data-testid="clone-warning">
        ⚠ This is not a valid source path / URL
      </p>
    {/if}

    <div class="actions">
      <button class="btn-cancel" onclick={onCancel}>Cancel</button>
      <button
        class="btn-primary"
        disabled={!formValid}
        data-testid="clone-submit"
        onclick={handleConfirm}
      >
        Clone
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
    width: 520px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .title {
    margin: 0 0 4px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-white, var(--color-text-primary));
  }

  .field {
    display: grid;
    grid-template-columns: 140px 1fr;
    align-items: center;
    gap: 8px;
  }

  .label {
    font-size: 12px;
    color: var(--color-text-secondary);
    justify-self: end;
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

  .dest-row {
    display: flex;
    gap: 4px;
  }

  .browse {
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    padding: 0 10px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
  }

  .browse:hover {
    background: var(--color-bg-hover);
  }

  .advanced-toggle {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    padding: 0;
    padding-left: 148px;
  }

  .advanced-toggle:hover {
    color: var(--color-text-primary);
  }

  .advanced-box {
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 8px 12px;
    margin-left: 148px;
  }

  .hint {
    margin: 0;
    font-size: 11px;
    color: var(--color-text-secondary);
  }

  .warn {
    margin: 0;
    padding-left: 148px;
    font-size: 11px;
    color: #d26464;
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
    background: var(--color-bg-toolbar, var(--color-bg-base));
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
