<script lang="ts">
  import type { RepoListEntry } from '../../shared/ipc';

  type Props = {
    repo: RepoListEntry;
    onOpen: () => void;
    onToggleFavourite: () => void;
    onRemove: () => void;
  };

  let { repo, onOpen, onToggleFavourite, onRemove }: Props = $props();
</script>

<div
  class="row"
  role="listitem"
  tabindex="0"
  ondblclick={onOpen}
  onkeydown={(e) => e.key === 'Enter' && onOpen()}
>
  <div class="icon" aria-hidden="true">&lt;/&gt;</div>
  <div class="info">
    <span class="name" title={repo.path}>{repo.name}</span>
    <div class="path">{repo.path}</div>
  </div>
  <div class="actions">
    <button
      type="button"
      class="btn"
      data-testid="repo-row-open"
      onclick={onOpen}
    >
      Open
    </button>
    <button
      type="button"
      class="btn-icon"
      title="Remove from favourites"
      data-testid="repo-row-unfavourite"
      onclick={onToggleFavourite}
    >
      ★
    </button>
    <button
      type="button"
      class="btn-icon danger"
      title="Remove from list"
      data-testid="repo-row-remove"
      onclick={onRemove}
    >
      ×
    </button>
  </div>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--color-border);
    cursor: pointer;
    transition: background 0.1s;
  }

  .row:hover,
  .row:focus-visible {
    background: var(--color-bg-hover);
    outline: none;
  }

  .icon {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #3b82f6;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: monospace;
    font-size: 12px;
    flex-shrink: 0;
  }

  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .name {
    color: var(--color-text-primary);
    font-size: 13px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn-icon[data-testid='repo-row-unfavourite'] {
    color: #e1ab18;
  }

  .path {
    color: var(--color-text-secondary);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .btn {
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    padding: 3px 10px;
    border-radius: 3px;
    font-size: 11px;
    cursor: pointer;
  }

  .btn:hover {
    background: var(--color-bg-base);
  }

  .btn-icon {
    background: transparent;
    border: 0;
    color: var(--color-text-secondary);
    width: 24px;
    height: 24px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .btn-icon:hover {
    background: var(--color-bg-surface);
    color: var(--color-text-primary);
  }

  .btn-icon.danger:hover {
    color: #d26464;
  }
</style>
