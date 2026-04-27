<script lang="ts">
  import type { Commit } from '../types';

  type Props = {
    commit: Commit;
    body?: string;
    onSelectParent?: (hash: string) => void;
  };

  let { commit, body = '', onSelectParent }: Props = $props();

  function refColor(ref: string): string {
    if (ref.startsWith('HEAD')) return '#569cd6';
    if (ref.startsWith('tag:')) return '#dcdcaa';
    if (ref.startsWith('origin/')) return '#4ec9b0';
    return '#6a9955';
  }
</script>

<div class="commit-info">
  <div class="commit-info-header">
    <img
      class="avatar"
      src="https://ui-avatars.com/api/?name={encodeURIComponent(
        commit.authorName,
      )}&size=40&background=333&color=ccc&rounded=true"
      alt=""
    />
    <div class="commit-title">{commit.message}</div>
  </div>

  {#if body}
    <pre class="commit-body">{body}</pre>
  {/if}

  <div class="commit-meta">
    <div class="meta-row">
      <span class="meta-label">Commit:</span>
      <span class="meta-value mono">{commit.hash} [{commit.hashShort}]</span>
    </div>
    {#if commit.parents.length > 0}
      <div class="meta-row">
        <span class="meta-label">Parents:</span>
        <span class="meta-value mono parent-links"
          >{#each commit.parents as parent, i}{#if i > 0},
            {/if}<button
              class="parent-link"
              onclick={() => onSelectParent?.(parent)}
              >{parent.slice(0, 8)}</button
            >{/each}</span
        >
      </div>
    {/if}
    <div class="meta-row">
      <span class="meta-label">Author:</span>
      <span class="meta-value"
        >{commit.authorName} &lt;{commit.authorEmail}&gt;</span
      >
    </div>
    <div class="meta-row">
      <span class="meta-label">Date:</span>
      <span class="meta-value">{new Date(commit.date).toLocaleString()}</span>
    </div>
    {#if commit.refs.length > 0}
      <div class="meta-row">
        <span class="meta-label">Labels:</span>
        <span class="meta-value label-badges">
          {#each commit.refs as ref}
            <span
              class="ref-label"
              style="border-color:{refColor(ref)}; background:{refColor(
                ref,
              )}22; color:{refColor(ref)}"
              >{ref.replace('tag: ', '').replace(/^HEAD -> /, '')}</span
            >
          {/each}
        </span>
      </div>
    {/if}
  </div>
</div>

<style>
  .commit-info {
    padding: 12px;
    overflow-y: auto;
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .commit-info-header {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .commit-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--color-text-white);
    line-height: 1.4;
  }

  .commit-body {
    margin: 0;
    font-size: 11px;
    color: var(--color-text-secondary);
    line-height: 1.5;
    white-space: pre-wrap;
    font-family: system-ui, sans-serif;
  }

  .commit-meta {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .meta-row {
    display: flex;
    font-size: 11px;
    line-height: 1.5;
  }

  .meta-label {
    width: 65px;
    flex-shrink: 0;
    color: var(--color-text-secondary);
    text-align: right;
    padding-right: 8px;
  }

  .meta-value {
    color: var(--color-text-primary);
    word-break: break-all;
  }

  .meta-value.mono {
    font-family: monospace;
    font-size: 11px;
  }

  .parent-links {
    color: var(--color-text-accent);
  }

  .parent-link {
    background: none;
    border: none;
    color: var(--color-text-accent);
    font-family: monospace;
    font-size: 11px;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
  }

  .parent-link:hover {
    color: var(--color-text-white);
  }

  .label-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .ref-label {
    display: inline-block;
    padding: 0 5px;
    border-radius: 3px;
    font-size: 9px;
    font-weight: 600;
    line-height: 16px;
    border: 1px solid;
    white-space: nowrap;
  }
</style>
