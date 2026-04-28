<script lang="ts">
  import type { BlameLine } from '../../shared/blame-parser';

  type Props = {
    line: BlameLine;
    /**
     * Pre-tokenised HTML for the line's content (output of
     * `highlightLines(...)`). Already escaped — safe to render via `@html`.
     */
    htmlContent: string;
    /** Show top border to mark the start of a new sha-group. */
    isGroupStart?: boolean;
    /** Color for the left band — same colour for consecutive same-sha rows. */
    bandColor: string;
    onChangesetClick?: () => void;
  };

  let {
    line,
    htmlContent,
    isGroupStart = false,
    bandColor,
    onChangesetClick,
  }: Props = $props();
</script>

<div
  class="code-line"
  class:group-start={isGroupStart}
  style="--band-color: {bandColor}"
  data-testid="code-line"
>
  <span class="col-line">{line.lineNumber}</span>
  <span
    class="col-author"
    title={line.authorEmail
      ? `${line.authorName} <${line.authorEmail}>`
      : line.authorName}
  >
    {line.authorName}
  </span>
  <button
    type="button"
    class="col-changeset"
    onclick={onChangesetClick}
    title="Show in file log"
    data-testid="code-line-changeset"
    data-hash={line.hash}
  >
    {line.hashShort}
  </button>
  <span class="col-content">
    <!-- htmlContent is produced by `highlightLines` which HTML-escapes
         every token before wrapping it in <span>. Safe to render. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html htmlContent}
  </span>
</div>

<style>
  .code-line {
    display: grid;
    grid-template-columns: 60px 180px 90px 1fr;
    gap: 12px;
    padding: 1px 8px 1px 12px;
    border-left: 3px solid var(--band-color);
    align-items: center;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    font-size: 11px;
    line-height: 1.5;
    color: var(--color-text-primary);
    white-space: pre;
  }

  .code-line.group-start {
    border-top: 1px solid var(--color-border);
  }

  .col-line {
    color: var(--color-text-secondary);
    text-align: right;
    user-select: none;
  }

  .col-author {
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-changeset {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    color: var(--color-text-accent);
    font-family: inherit;
    font-size: inherit;
    cursor: pointer;
    text-align: left;
  }

  .col-changeset:hover {
    text-decoration: underline;
  }

  .col-content {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: pre;
    color: var(--color-text-primary);
  }
</style>
