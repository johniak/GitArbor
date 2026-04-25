<script lang="ts">
  import { AlertTriangle } from '@lucide/svelte';
  import type { OperationKind } from '../../shared/ipc';

  type Props = {
    kind: OperationKind;
    conflictCount: number;
    onAbort: () => void;
    onContinue: () => void;
  };

  let { kind, conflictCount, onAbort, onContinue }: Props = $props();

  const kindLabel = $derived(
    kind === 'merge'
      ? 'Merge'
      : kind === 'rebase'
        ? 'Rebase'
        : kind === 'cherry-pick'
          ? 'Cherry-pick'
          : 'Revert',
  );

  const continueLabel = $derived(kind === 'merge' ? 'Commit' : 'Continue');

  const message = $derived(
    conflictCount > 0
      ? `${kindLabel} in progress — ${conflictCount} ${conflictCount === 1 ? 'conflict' : 'conflicts'} to resolve`
      : `${kindLabel} in progress — all conflicts resolved, ready to ${kind === 'merge' ? 'commit' : 'continue'}`,
  );
</script>

<div class="banner" data-testid="conflict-banner">
  <div class="lhs">
    <AlertTriangle size={16} strokeWidth={1.8} />
    <span class="msg">{message}</span>
  </div>
  <div class="actions">
    <button
      type="button"
      class="continue"
      disabled={conflictCount > 0}
      onclick={onContinue}
      data-testid="conflict-banner-continue">{continueLabel}</button
    >
    <button
      type="button"
      class="abort"
      onclick={onAbort}
      data-testid="conflict-banner-abort">Abort</button
    >
  </div>
</div>

<style>
  .banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 14px;
    background: #5a3e0f;
    color: #fbe6b9;
    border-bottom: 1px solid #d18b3a;
    flex-shrink: 0;
    font-size: 12px;
  }

  .lhs {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #fbe6b9;
  }

  .msg {
    font-weight: 500;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .continue {
    background: var(--color-diff-added);
    color: #ffffff;
    border: none;
    padding: 4px 14px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .continue:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .continue:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .abort {
    background: var(--color-diff-deleted);
    color: #ffffff;
    border: none;
    padding: 4px 14px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .abort:hover {
    filter: brightness(1.1);
  }
</style>
