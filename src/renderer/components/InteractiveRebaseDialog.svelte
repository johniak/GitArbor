<script lang="ts">
  import { onMount } from 'svelte';
  import { ChevronUp, ChevronDown } from '@lucide/svelte';
  import DiffViewer from './DiffViewer.svelte';
  import FileList from './FileList.svelte';
  import CommitInfoPanel from './CommitInfoPanel.svelte';
  import { settingsStore } from '../settings-store.svelte';
  import type { ChangedFile, Commit, FileDiff } from '../types';
  import type { FileSortMode, FileViewMode } from '../lib/file-list-sort';
  import type {
    RebaseAction,
    RebasePlan,
    RebaseStep,
    RunInteractiveRebaseResult,
  } from '../../shared/rebase-types';

  type Props = {
    baseHash: string;
    baseShortHash: string;
    baseSubject: string;
    initialSteps: RebaseStep[];
    onConfirm: (plan: RebasePlan) => Promise<RunInteractiveRebaseResult>;
    onCancel: () => void;
  };

  let {
    baseHash,
    baseShortHash,
    baseSubject,
    initialSteps,
    onConfirm,
    onCancel,
  }: Props = $props();

  // Plan state — newest-first matches UI order.
  let steps = $state<RebaseStep[]>(initialSteps.map((s) => ({ ...s })));
  let selectedHash = $state<string | null>(steps[0]?.hash ?? null);

  // Inline message editor state.
  let editingFor = $state<{
    hash: string;
    mode: 'reword' | 'squash';
    draft: string;
  } | null>(null);

  // Diff preview state.
  let previewFiles = $state<ChangedFile[]>([]);
  let previewSelectedFile = $state<string | null>(null);
  let previewDiff = $state<FileDiff | null>(null);
  let previewBody = $state('');

  // The commit-info panel + FileList both want a Commit object. Build one
  // from the selected step plus the lazily-fetched body.
  let previewCommit = $derived.by<Commit | null>(() => {
    if (!selectedStep) return null;
    return {
      hash: selectedStep.hash,
      hashShort: selectedStep.hashShort,
      message: selectedStep.subject,
      authorName: selectedStep.authorName,
      authorEmail: selectedStep.authorEmail,
      date: selectedStep.date,
      dateRelative: '',
      parents: selectedStep.parents,
      refs: selectedStep.refs,
    };
  });

  // FileList view/sort settings come from the historical context — same
  // preference the user picks when browsing commits in the main history view.
  let listViewMode = $derived(
    settingsStore.settings.fileList.historical.viewMode,
  );
  let listSortMode = $derived(
    settingsStore.settings.fileList.historical.sortMode,
  );

  function setListViewMode(viewMode: FileViewMode) {
    settingsStore.update({ fileList: { historical: { viewMode } } });
  }
  function setListSortMode(sortMode: FileSortMode) {
    settingsStore.update({ fileList: { historical: { sortMode } } });
  }

  let selectedStep = $derived(
    steps.find((s) => s.hash === selectedHash) ?? null,
  );
  let selectedIndex = $derived(
    selectedHash ? steps.findIndex((s) => s.hash === selectedHash) : -1,
  );

  // Squash with previous: only valid when there is a row visually below
  // (= older), and that row isn't a drop / squash itself (v1 limitation).
  let squashEnabled = $derived.by(() => {
    if (selectedIndex < 0 || selectedIndex >= steps.length - 1) return false;
    const target = steps[selectedIndex + 1];
    return target.action !== 'drop' && target.action !== 'squash';
  });

  let canMoveUp = $derived(selectedIndex > 0);
  let canMoveDown = $derived(
    selectedIndex >= 0 && selectedIndex < steps.length - 1,
  );

  function actionLabel(action: RebaseAction): string {
    if (action === 'pick') return '';
    if (action === 'drop') return 'Drop';
    if (action === 'reword') return 'Reword';
    if (action === 'edit') return 'Edit';
    return 'Squash';
  }

  function selectStep(hash: string) {
    selectedHash = hash;
    void loadPreviewForCommit(hash);
  }

  async function loadPreviewForCommit(hash: string) {
    previewFiles = [];
    previewSelectedFile = null;
    previewDiff = null;
    previewBody = '';
    try {
      const [files, body] = await Promise.all([
        window.electronAPI.git.getCommitFiles(hash),
        window.electronAPI.git.getCommitBody(hash),
      ]);
      previewFiles = files;
      previewBody = body;
      const first = files[0];
      if (first) {
        previewSelectedFile = first.path;
        previewDiff = await window.electronAPI.git.getFileDiff(
          hash,
          first.path,
        );
      }
    } catch (e) {
      console.error('rebase preview load failed', e);
    }
  }

  async function selectPreviewFile(path: string) {
    previewSelectedFile = path;
    if (!selectedHash) return;
    try {
      previewDiff = await window.electronAPI.git.getFileDiff(
        selectedHash,
        path,
      );
    } catch (e) {
      console.error('preview diff load failed', e);
    }
  }

  function toggleDrop() {
    if (selectedIndex < 0) return;
    const cur = steps[selectedIndex];
    const next: RebaseAction = cur.action === 'drop' ? 'pick' : 'drop';
    steps[selectedIndex] = { ...cur, action: next, newMessage: undefined };
  }

  function toggleAmend(hash: string) {
    const i = steps.findIndex((s) => s.hash === hash);
    if (i < 0) return;
    const cur = steps[i];
    const next: RebaseAction = cur.action === 'edit' ? 'pick' : 'edit';
    steps[i] = { ...cur, action: next, newMessage: undefined };
  }

  function startRewordEditor() {
    if (!selectedStep) return;
    editingFor = {
      hash: selectedStep.hash,
      mode: 'reword',
      draft: selectedStep.newMessage ?? selectedStep.subject,
    };
  }

  function startSquashEditor() {
    if (!selectedStep || !squashEnabled) return;
    const target = steps[selectedIndex + 1];
    const defaultMsg =
      selectedStep.newMessage ?? `${target.subject}\n\n${selectedStep.subject}`;
    editingFor = {
      hash: selectedStep.hash,
      mode: 'squash',
      draft: defaultMsg,
    };
  }

  function commitMessageDraft() {
    if (!editingFor) return;
    const i = steps.findIndex((s) => s.hash === editingFor!.hash);
    if (i < 0) {
      editingFor = null;
      return;
    }
    const action: RebaseAction =
      editingFor.mode === 'squash' ? 'squash' : 'reword';
    steps[i] = { ...steps[i], action, newMessage: editingFor.draft };
    editingFor = null;
  }

  function cancelMessageDraft() {
    editingFor = null;
  }

  function moveSelected(delta: -1 | 1) {
    const i = selectedIndex;
    const j = i + delta;
    if (i < 0 || j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    steps = next;
  }

  function resetPlan() {
    steps = initialSteps.map((s) => ({ ...s }));
    editingFor = null;
  }

  let submitting = $state(false);
  let submitError = $state<string | null>(null);

  async function handleConfirm() {
    if (submitting) return;
    submitting = true;
    submitError = null;
    try {
      // $state proxies aren't structured-clone-able; snapshot before IPC.
      const plainSteps = $state.snapshot(steps) as RebaseStep[];
      const result = await onConfirm({ baseHash, steps: plainSteps });
      if (result.error) {
        submitError = result.error;
        submitting = false;
      }
      // On success or conflict path the parent dismisses the dialog.
    } catch (e) {
      submitError = e instanceof Error ? e.message : String(e);
      submitting = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (editingFor) return; // editor handles its own keys
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }

  onMount(() => {
    if (selectedHash) void loadPreviewForCommit(selectedHash);
  });
</script>

<svelte:window onkeydown={onKeydown} />

<div class="overlay" onclick={onCancel} role="dialog" aria-modal="true">
  <div class="dialog" onclick={(e) => e.stopPropagation()}>
    <h3 class="title">
      Rebase children of <code class="hash">{baseShortHash}</code>
      <span class="subject">{baseSubject}</span>
    </h3>

    <div class="step-list" data-testid="rebase-step-list">
      <div class="step-header">
        <span class="col-changeset">Changeset</span>
        <span class="col-amend">Amend Commit?</span>
        <span class="col-description">Description</span>
        <span class="col-date">Commit Date</span>
      </div>
      {#each steps as step (step.hash)}
        {@const isSelected = step.hash === selectedHash}
        {@const isDropped = step.action === 'drop'}
        <div
          class="step-row"
          class:selected={isSelected}
          class:dropped={isDropped}
          class:reword={step.action === 'reword'}
          class:edit={step.action === 'edit'}
          class:squash={step.action === 'squash'}
          onclick={() => selectStep(step.hash)}
          role="button"
          tabindex="0"
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              selectStep(step.hash);
            }
          }}
          data-testid="rebase-step-row"
          data-action={step.action}
        >
          <span class="col-changeset"><code>{step.hashShort}</code></span>
          <span class="col-amend">
            <input
              type="checkbox"
              checked={step.action === 'edit'}
              disabled={isDropped}
              onclick={(e) => {
                e.stopPropagation();
                toggleAmend(step.hash);
              }}
              data-testid="rebase-amend"
            />
          </span>
          <span class="col-description">
            <span class="subject-text">{step.newMessage ?? step.subject}</span>
            {#if actionLabel(step.action)}
              <span class="action-badge action-{step.action}"
                >{actionLabel(step.action)}</span
              >
            {/if}
          </span>
          <span class="col-date">
            {new Date(step.date).toLocaleDateString()}
          </span>
        </div>
      {/each}
    </div>

    <div class="action-row">
      <button
        class="btn-secondary"
        onclick={resetPlan}
        data-testid="rebase-reset">Reset</button
      >
      <button
        class="btn-secondary"
        disabled={!selectedStep || selectedStep.action === 'drop'}
        onclick={startRewordEditor}
        data-testid="rebase-edit-message">Edit message</button
      >
      <button
        class="btn-secondary"
        disabled={!squashEnabled}
        onclick={startSquashEditor}
        data-testid="rebase-squash">Squash with previous</button
      >
      <button
        class="btn-secondary"
        disabled={!selectedStep}
        onclick={toggleDrop}
        data-testid="rebase-delete"
        >{selectedStep?.action === 'drop' ? 'Restore' : 'Delete'}</button
      >
      <button
        class="btn-icon"
        disabled={!canMoveUp}
        onclick={() => moveSelected(-1)}
        title="Move up"
        data-testid="rebase-move-up"
      >
        <ChevronUp size={14} />
      </button>
      <button
        class="btn-icon"
        disabled={!canMoveDown}
        onclick={() => moveSelected(1)}
        title="Move down"
        data-testid="rebase-move-down"
      >
        <ChevronDown size={14} />
      </button>
    </div>

    <div class="preview" data-testid="rebase-preview">
      <div class="preview-left">
        {#if previewCommit}
          <div class="preview-commit-info">
            <CommitInfoPanel commit={previewCommit} body={previewBody} />
          </div>
        {/if}
        <div class="preview-files">
          <FileList
            files={previewFiles}
            selectedPath={previewSelectedFile}
            viewMode={listViewMode}
            sortMode={listSortMode}
            onSelectFile={(path) => selectPreviewFile(path)}
            onViewMode={setListViewMode}
            onSortMode={setListSortMode}
          />
        </div>
      </div>
      <div class="preview-diff">
        <DiffViewer diff={previewDiff} />
      </div>
    </div>

    {#if submitError}
      <p class="error">{submitError}</p>
    {/if}

    <div class="actions">
      <button class="btn-cancel" onclick={onCancel} disabled={submitting}
        >Cancel</button
      >
      <button
        class="btn-primary"
        onclick={handleConfirm}
        disabled={submitting}
        data-testid="rebase-submit"
      >
        {submitting ? 'Rebasing…' : 'OK'}
      </button>
    </div>

    {#if editingFor}
      <div class="message-editor-overlay" onclick={cancelMessageDraft}>
        <div class="message-editor" onclick={(e) => e.stopPropagation()}>
          <h4>
            {editingFor.mode === 'squash'
              ? 'Combined commit message'
              : 'New commit message'}
          </h4>
          <textarea
            class="message-textarea"
            bind:value={editingFor.draft}
            data-testid="rebase-message-input"
            rows={6}
          ></textarea>
          <div class="actions">
            <button class="btn-cancel" onclick={cancelMessageDraft}
              >Cancel</button
            >
            <button
              class="btn-primary"
              onclick={commitMessageDraft}
              data-testid="rebase-message-confirm">OK</button
            >
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .dialog {
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 16px;
    width: min(960px, 92vw);
    height: min(720px, 88vh);
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    position: relative;
  }

  .title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-white);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .hash {
    font-family: monospace;
    background: var(--color-bg-base);
    padding: 2px 6px;
    border-radius: 3px;
    border: 1px solid var(--color-border);
    font-size: 11px;
    color: var(--color-text-primary);
  }

  .subject {
    color: var(--color-text-secondary);
    font-weight: 400;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .step-list {
    flex: 0 0 auto;
    max-height: 35%;
    overflow-y: auto;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-bg-base);
  }

  .step-header,
  .step-row {
    display: grid;
    grid-template-columns: 90px 110px 1fr 110px;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    font-size: 11px;
  }

  .step-header {
    font-weight: 600;
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-surface);
    position: sticky;
    top: 0;
  }

  .step-row {
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .step-row:hover {
    background: var(--color-bg-hover);
  }

  .step-row.selected {
    background: var(--color-bg-selected);
  }

  .step-row.dropped .subject-text,
  .step-row.dropped .col-changeset code {
    text-decoration: line-through;
    opacity: 0.55;
  }

  .step-row.reword .subject-text,
  .step-row.squash .subject-text {
    font-style: italic;
  }

  .col-changeset code {
    font-family: monospace;
    font-size: 10px;
    color: var(--color-text-secondary);
  }

  .col-amend {
    display: flex;
    justify-content: center;
  }

  .col-description {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
  }

  .subject-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .action-badge {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 1px 6px;
    border-radius: 3px;
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
  }

  .action-badge.action-drop {
    color: #d16a6a;
    border-color: #6b3838;
  }
  .action-badge.action-reword,
  .action-badge.action-squash {
    color: #e2a04f;
    border-color: #5b431f;
  }
  .action-badge.action-edit {
    color: #58a6ff;
    border-color: #2a4a6a;
  }

  .col-date {
    color: var(--color-text-secondary);
    font-size: 10px;
    text-align: right;
  }

  .action-row {
    flex: 0 0 auto;
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .btn-secondary,
  .btn-icon {
    padding: 4px 12px;
    border: 1px solid var(--color-border);
    background: var(--color-bg-toolbar);
    color: var(--color-text-primary);
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    font-family: inherit;
  }

  .btn-icon {
    padding: 4px 8px;
    display: inline-flex;
    align-items: center;
  }

  .btn-secondary:hover:not(:disabled),
  .btn-icon:hover:not(:disabled) {
    background: var(--color-bg-hover);
  }

  .btn-secondary:disabled,
  .btn-icon:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .preview {
    flex: 1 1 auto;
    display: grid;
    grid-template-columns: minmax(320px, 40%) 1fr;
    gap: 8px;
    min-height: 0;
  }

  .preview-left {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-bg-base);
    overflow: hidden;
    min-height: 0;
  }

  .preview-commit-info {
    flex: 0 0 auto;
    max-height: 45%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--color-border);
  }

  .preview-files {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .preview-diff {
    border: 1px solid var(--color-border);
    border-radius: 4px;
    overflow: hidden;
    min-width: 0;
  }

  .error {
    margin: 0;
    color: #d16a6a;
    font-size: 11px;
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
    font-size: 12px;
    cursor: pointer;
  }

  .btn-cancel:hover:not(:disabled) {
    background: var(--color-bg-hover);
  }

  .btn-primary {
    padding: 6px 24px;
    border: none;
    background: #0e639c;
    color: white;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    font-weight: 600;
  }

  .btn-primary:hover:not(:disabled) {
    background: #1177bb;
  }

  .btn-primary:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .message-editor-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
  }

  .message-editor {
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 16px;
    width: 540px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
  }

  .message-editor h4 {
    margin: 0;
    font-size: 12px;
    color: var(--color-text-white);
  }

  .message-textarea {
    width: 100%;
    box-sizing: border-box;
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    padding: 8px;
    border-radius: 4px;
    font-size: 12px;
    font-family: system-ui, sans-serif;
    resize: vertical;
    outline: none;
  }

  .message-textarea:focus {
    border-color: var(--color-text-accent);
  }
</style>
