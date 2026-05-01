<script lang="ts">
  import type { AppSettings } from '../../shared/ipc';

  type Props = {
    settings: AppSettings;
    onChange: (patch: Partial<AppSettings['diff']>) => void;
  };

  let { settings, onChange }: Props = $props();

  let viewMode = $state(settings.diff.viewMode);
  let syntaxHighlight = $state(settings.diff.syntaxHighlight);
  let wordDiff = $state(settings.diff.wordDiff);

  function commitViewMode() {
    onChange({ viewMode });
  }
  function commitSyntax() {
    onChange({ syntaxHighlight });
  }
  function commitWordDiff() {
    onChange({ wordDiff });
  }
</script>

<div class="page">
  <fieldset class="group">
    <legend>View</legend>
    <div class="field">
      <span class="field-label">Default view mode</span>
      <div class="radio-stack">
        <label class="radio-row">
          <input
            type="radio"
            name="diff-view-mode"
            value="unified"
            bind:group={viewMode}
            onchange={commitViewMode}
            data-testid="settings-diff-view-unified"
          />
          Unified — single column, removed and added lines stacked vertically
        </label>
        <label class="radio-row">
          <input
            type="radio"
            name="diff-view-mode"
            value="split"
            bind:group={viewMode}
            onchange={commitViewMode}
            data-testid="settings-diff-view-split"
          />
          Split — old / new side-by-side. Per-line staging is read-only in this mode;
          switch to Unified for line-level Stage / Discard.
        </label>
      </div>
    </div>
  </fieldset>

  <fieldset class="group">
    <legend>Highlighting</legend>
    <label class="checkbox-row">
      <input
        type="checkbox"
        bind:checked={syntaxHighlight}
        onchange={commitSyntax}
        data-testid="settings-diff-syntax"
      />
      <span>
        Syntax highlighting
        <span class="hint">
          Tokenises diff line content via Shiki (TypeScript, JavaScript, Python,
          Go, Rust, Java, Kotlin, Svelte, CSS, HTML, JSON, YAML, shell,
          Markdown). Per-line — multi-line strings may render with slightly off
          colours.
        </span>
      </span>
    </label>
    <label class="checkbox-row">
      <input
        type="checkbox"
        bind:checked={wordDiff}
        onchange={commitWordDiff}
        data-testid="settings-diff-word-diff"
      />
      <span>
        Word-level diff
        <span class="hint">
          For paired modification lines (a removed line immediately followed by
          an added one), highlights only the words that changed instead of the
          whole line. Overrides syntax highlighting on those lines.
        </span>
      </span>
    </label>
  </fieldset>
</div>

<style>
  .page {
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    overflow-y: auto;
  }

  .group {
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 14px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .group legend {
    padding: 0 6px;
    font-size: 12px;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .field {
    display: grid;
    grid-template-columns: 130px 1fr;
    gap: 12px;
    align-items: flex-start;
  }

  .field-label {
    color: var(--color-text-secondary);
    font-size: 12px;
    text-align: right;
    padding-top: 4px;
  }

  .radio-stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .radio-row,
  .checkbox-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 13px;
    color: var(--color-text-primary);
    line-height: 1.4;
    cursor: pointer;
  }

  .radio-row input,
  .checkbox-row input {
    accent-color: var(--color-text-accent);
    margin-top: 3px;
    flex-shrink: 0;
  }

  .hint {
    display: block;
    margin-top: 4px;
    font-size: 11px;
    color: var(--color-text-secondary);
    line-height: 1.4;
  }
</style>
