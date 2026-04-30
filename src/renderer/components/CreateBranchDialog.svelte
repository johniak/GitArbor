<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Sparkles, X, Loader2 } from '@lucide/svelte';
  import { aiStore } from '../ai-store.svelte';
  import type { AITokenEvent } from '../../shared/ipc';

  type Props = {
    currentBranch: string;
    initialStartPoint?: string;
    onConfirm: (
      name: string,
      startPoint: string | undefined,
      checkout: boolean,
    ) => void;
    onCancel: () => void;
  };

  let { currentBranch, initialStartPoint, onConfirm, onCancel }: Props =
    $props();

  let branchName = $state('');
  let commitMode = $state<'working' | 'specified'>(
    initialStartPoint ? 'specified' : 'working',
  );
  let specifiedCommit = $state(initialStartPoint ?? '');
  let checkoutAfter = $state(true);

  let aiRequestId = $state<string | null>(null);
  let aiThinking = $state(false);
  let aiOff: (() => void) | undefined;
  let aiHolderId: string | null = null;

  // Warm-load the model as soon as the dialog mounts (and modelReady is
  // true). The hold suppresses idle eviction; the matching release on
  // unmount unloads the model unless `keepModelLoaded` is on.
  $effect(() => {
    if (!aiStore.modelReady) return;
    let cancelled = false;
    void (async () => {
      const r = await window.electronAPI.ai.holdModel();
      if (cancelled) {
        if (r.holderId) void window.electronAPI.ai.releaseModel(r.holderId);
        return;
      }
      aiHolderId = r.holderId || null;
    })();
    return () => {
      cancelled = true;
      if (aiHolderId) {
        const id = aiHolderId;
        aiHolderId = null;
        void window.electronAPI.ai.releaseModel(id);
      }
    };
  });

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
    if (e.key === 'Enter' && !aiRequestId) handleConfirm();
  }

  async function generateWithAI() {
    if (aiRequestId) return;
    branchName = '';

    // Pre-allocate the requestId so the listener's filter is correct
    // before we even fire the IPC call. Otherwise an early `done/error`
    // event (e.g. model arch unsupported) races the inferStream invoke
    // reply and gets filtered out, causing the UI to hang.
    const myRequestId = crypto.randomUUID();
    aiRequestId = myRequestId;

    aiThinking = true;
    aiOff = window.electronAPI.ai.onToken((event: AITokenEvent) => {
      if (event.requestId !== myRequestId) return;
      if (event.type === 'token') {
        if (aiThinking) aiThinking = false;
        branchName += event.delta;
      } else {
        aiRequestId = null;
        aiThinking = false;
        aiOff?.();
        aiOff = undefined;
        if (event.type === 'done' && event.reason === 'error') {
          console.error('[ai] branch-name error:', event.error);
          if (event.error) alert(`AI generation failed: ${event.error}`);
        }
      }
    });

    try {
      const recent = await window.electronAPI.git.getCommits({ maxCount: 10 });
      const subjects = recent
        .map((c) => `- ${c.message.split('\n')[0].slice(0, 100)}`)
        .join('\n');
      let startPointLine = '';
      if (commitMode === 'specified' && specifiedCommit.trim()) {
        const target = recent.find((c) =>
          c.hash.startsWith(specifiedCommit.trim()),
        );
        if (target) {
          startPointLine = `Start point commit: ${target.message.split('\n')[0].slice(0, 200)}`;
        }
      }

      // Working-tree summary: if user has staged or unstaged changes, give
      // the model a concise picture of what they're about to branch into.
      // Branch name should reflect the work, not just the parent's history.
      let workingSummary = '';
      try {
        const status = await window.electronAPI.git.getWorkingStatus();
        if (status.hasChanges) {
          const interesting = [...status.staged, ...status.unstaged].slice(
            0,
            12,
          );
          const lines = interesting.map(
            (f) =>
              `  ${f.status} ${f.path}${f.from ? ` (from ${f.from})` : ''}`,
          );
          workingSummary = `Working tree changes (${status.staged.length} staged, ${status.unstaged.length} unstaged):\n${lines.join('\n')}`;
          // One small diff sample to ground the type/scope guess.
          const sample = status.staged[0] ?? status.unstaged[0];
          if (sample) {
            try {
              const d = await window.electronAPI.git.getWorkingDiff(
                sample.path,
                Boolean(status.staged[0]),
              );
              if (!d.binary && d.hunks.length > 0) {
                const firstHunk = d.hunks[0];
                const hunkLines = firstHunk.lines
                  .slice(0, 20)
                  .map((l) => {
                    const p =
                      l.type === 'added'
                        ? '+'
                        : l.type === 'removed'
                          ? '-'
                          : ' ';
                    return `${p}${l.content}`;
                  })
                  .join('\n');
                workingSummary += `\n\nSample diff (${sample.path}):\n${firstHunk.header}\n${hunkLines}`;
              }
            } catch {
              // ignore — sample is optional
            }
          }
        }
      } catch {
        // ignore — working summary is optional
      }

      const system =
        'You generate concise git branch names. Respond with ONLY the branch name in kebab-case, lowercase ASCII, no spaces, no quotes, no explanation. Format: <type>/<short-slug>. Types: feat, fix, chore, refactor, docs, test. Max 60 chars.';
      const promptParts: string[] = [
        `Current branch: ${currentBranch}`,
        '',
        'Recent commits (latest first):',
        subjects,
      ];
      if (startPointLine) {
        promptParts.push('', startPointLine);
      }
      if (workingSummary) {
        promptParts.push('', workingSummary);
      }
      promptParts.push('', 'Generate a branch name for the next change.');
      const prompt = promptParts.join('\n');

      const r = await window.electronAPI.ai.inferStream({
        requestId: myRequestId,
        kind: 'branch-name',
        system,
        prompt,
        maxTokens: 32,
        temperature: 0.4,
        stop: ['\n'],
      });
      if (r.error) {
        aiOff?.();
        aiOff = undefined;
        aiRequestId = null;
        aiThinking = false;
        alert(`AI generation failed: ${r.error}`);
        return;
      }
    } catch (e) {
      console.error('[ai] branch-name failed:', e);
      aiRequestId = null;
      aiThinking = false;
      aiOff?.();
      aiOff = undefined;
    }
  }

  async function cancelAI() {
    if (!aiRequestId) return;
    await window.electronAPI.ai.cancelInfer(aiRequestId);
  }

  onDestroy(() => {
    if (aiRequestId) void window.electronAPI.ai.cancelInfer(aiRequestId);
    aiOff?.();
  });
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
      <div class="input-row">
        <!-- svelte-ignore a11y_autofocus -->
        <input
          id="branch-name"
          class="input"
          type="text"
          placeholder="Branch name..."
          bind:value={branchName}
          autofocus
        />
        {#if aiStore.modelReady}
          {#if aiRequestId}
            <button
              type="button"
              class="ai-btn ai-btn-cancel"
              onclick={cancelAI}
              title="Cancel AI generation"
              data-testid="branch-ai-cancel"
            >
              {#if aiThinking}
                <span class="ai-spin"><Loader2 size={14} /></span>
                Thinking…
              {:else}
                <X size={14} /> Stop
              {/if}
            </button>
          {:else}
            <button
              type="button"
              class="ai-btn"
              onclick={generateWithAI}
              title="Generate with AI"
              data-testid="branch-ai-generate"
            >
              <Sparkles size={14} /> Generate
            </button>
          {/if}
        {/if}
      </div>
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
      <button
        class="btn-primary"
        disabled={!slug || !!aiRequestId}
        onclick={handleConfirm}
      >
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

  .input-row {
    display: flex;
    align-items: stretch;
    gap: 6px;
  }

  .input {
    background: var(--color-bg-base);
    border: 2px solid var(--color-text-accent);
    color: var(--color-text-primary);
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 13px;
    outline: none;
    flex: 1;
  }

  .ai-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 10px;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-text-accent);
    color: var(--color-text-accent);
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }

  .ai-btn:hover {
    background: var(--color-bg-hover);
  }

  .ai-btn-cancel {
    border-color: var(--color-border);
    color: var(--color-text-primary);
  }

  .ai-spin {
    display: inline-flex;
    align-items: center;
    animation: ai-spin 1s linear infinite;
  }

  @keyframes ai-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
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
