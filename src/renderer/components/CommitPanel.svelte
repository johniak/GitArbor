<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Sparkles, X, Loader2 } from '@lucide/svelte';
  import { settingsStore } from '../settings-store.svelte';
  import { aiStore } from '../ai-store.svelte';
  import type { AITokenEvent } from '../../shared/ipc';

  type Props = {
    currentBranch?: string | null;
    stagingMode?: 'split' | 'fluid' | 'none';
    onCommit?: (
      message: string,
      amend: boolean,
      push: boolean,
      noVerify: boolean,
    ) => void;
    onCancel?: () => void;
  };

  let {
    currentBranch = null,
    stagingMode = 'split',
    onCommit,
    onCancel,
  }: Props = $props();

  const STAGING_HINT: Record<NonNullable<Props['stagingMode']>, string> = {
    split: '',
    fluid: 'Fluid: tick the files to include',
    none: 'No staging: all changes will be committed',
  };

  let message = $state('');
  let amend = $state(false);
  let pushAfterCommit = $derived(settingsStore.settings.commit.pushAfterCommit);
  let noVerify = $derived(settingsStore.settings.commit.noVerify);
  let authorName = $state('');
  let authorEmail = $state('');

  let aiRequestId = $state<string | null>(null);
  let aiThinking = $state(false);
  let aiOff: (() => void) | undefined;
  let aiHolderId: string | null = null;

  // Hold the model warm while the user is in the commit view. The
  // matching release on unmount lets the main process unload it (unless
  // `keepModelLoaded` is on, in which case it's a no-op).
  $effect(() => {
    if (!aiStore.sourceReady) return;
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

  onMount(async () => {
    const stored = settingsStore.settings.commit;
    if (stored.authorName) {
      authorName = stored.authorName;
    }
    if (stored.authorEmail) {
      authorEmail = stored.authorEmail;
    }
    if (!authorName || !authorEmail) {
      try {
        if (!authorName) {
          authorName = await window.electronAPI.git.getConfig('user.name');
        }
        if (!authorEmail) {
          authorEmail = await window.electronAPI.git.getConfig('user.email');
        }
      } catch {
        // ignore
      }
    }
  });

  function handleCommit() {
    if (!message.trim()) return;
    onCommit?.(message, amend, pushAfterCommit, noVerify);
    message = '';
  }

  async function generateWithAI() {
    if (aiRequestId) return;
    if (
      message.trim() &&
      !confirm('Replace the current draft with an AI-generated message?')
    ) {
      return;
    }
    message = '';

    // Pre-allocate the requestId so the listener's filter is correct
    // before we even fire the IPC call (otherwise early done/error events
    // race the invoke reply and get filtered out → UI hang).
    const myRequestId = crypto.randomUUID();
    aiRequestId = myRequestId;

    aiThinking = true;
    aiOff = window.electronAPI.ai.onToken((event: AITokenEvent) => {
      if (event.requestId !== myRequestId) return;
      if (event.type === 'token') {
        if (aiThinking) aiThinking = false;
        message += event.delta;
      } else {
        aiRequestId = null;
        aiThinking = false;
        aiOff?.();
        aiOff = undefined;
        if (event.type === 'done' && event.reason === 'error') {
          console.error('[ai] commit-message error:', event.error);
          if (event.error) alert(`AI generation failed: ${event.error}`);
        }
      }
    });

    try {
      const status = await window.electronAPI.git.getWorkingStatus();
      if (status.staged.length === 0) {
        aiOff?.();
        aiOff = undefined;
        aiRequestId = null;
        aiThinking = false;
        alert(
          'No staged files. Stage some changes first, then click Generate again.',
        );
        return;
      }
      const diffs = await Promise.all(
        status.staged.map(async (f) => ({
          path: f.path,
          diff: await window.electronAPI.git.getWorkingDiff(f.path, true),
        })),
      );
      const truncated = await truncateDiffsRenderer(diffs);

      const recent = await window.electronAPI.git.getCommits({ maxCount: 5 });
      const subjects = recent
        .map((c) => `- ${c.message.split('\n')[0].slice(0, 100)}`)
        .join('\n');

      const system =
        "You write concise, conventional-commit-style messages. Format: '<type>(<scope>): <subject>' followed by an optional bullet body. Types: feat, fix, chore, refactor, docs, test, perf. Subject ≤ 72 chars, imperative mood, no period at end. Body: optional bullets if multiple distinct changes. Respond with the commit message only — no explanation, no markdown fences.";
      const prompt = [
        `Branch: ${currentBranch ?? 'unknown'}`,
        '',
        'Recent commit subjects (style reference):',
        subjects || '(no recent commits)',
        '',
        'Staged diff:',
        truncated,
        '',
        'Write the commit message.',
      ].join('\n');

      const r = await window.electronAPI.ai.inferStream({
        requestId: myRequestId,
        kind: 'commit-message',
        system,
        prompt,
        maxTokens: 256,
        temperature: 0.3,
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
      console.error('[ai] commit-message failed:', e);
      aiRequestId = null;
      aiThinking = false;
      aiOff?.();
      aiOff = undefined;
    }
  }

  /**
   * Renderer-side trivial truncation: cap each file's serialised diff to
   * 4 KB and the total to 12 KB, so we don't ship multi-megabyte diffs to
   * the model. Mirrors the budget in `src/main/diff-truncate.ts` but works
   * directly off `FileDiff` shapes without an extra IPC hop.
   */
  async function truncateDiffsRenderer(
    files: Array<{ path: string; diff: import('../types').FileDiff }>,
  ): Promise<string> {
    const MAX_FILE = 4 * 1024;
    const MAX_TOTAL = 12 * 1024;
    const parts: string[] = [];
    let total = 0;
    for (const f of files) {
      let body: string;
      if (f.diff.binary) {
        body = `<binary>: ${f.path}`;
      } else {
        const lines: string[] = [`diff --git a/${f.path} b/${f.path}`];
        for (const h of f.diff.hunks) {
          lines.push(h.header);
          for (const l of h.lines) {
            const prefix =
              l.type === 'added' ? '+' : l.type === 'removed' ? '-' : ' ';
            lines.push(`${prefix}${l.content}`);
          }
        }
        body = lines.join('\n');
        if (body.length > MAX_FILE)
          body = body.slice(0, MAX_FILE) + '\n... <truncated>';
      }
      if (total + body.length > MAX_TOTAL && parts.length > 0) {
        parts.push(`<${f.path}>: omitted (total budget reached)`);
        break;
      }
      parts.push(body);
      total += body.length + 2;
    }
    return parts.join('\n\n');
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

<div class="commit-panel">
  <div class="author-row">
    <span class="author">
      {authorName}
      {#if authorEmail}<span class="email">&lt;{authorEmail}&gt;</span>{/if}
    </span>
    {#if STAGING_HINT[stagingMode]}
      <span class="staging-hint" data-testid="staging-hint"
        >{STAGING_HINT[stagingMode]}</span
      >
    {/if}
  </div>

  <div class="textarea-wrap">
    <textarea
      class="commit-message"
      placeholder="Commit message..."
      bind:value={message}
      rows={4}
    ></textarea>
    {#if aiStore.sourceReady}
      {#if aiRequestId}
        <button
          type="button"
          class="ai-btn ai-btn-cancel"
          onclick={cancelAI}
          title="Cancel AI generation"
          data-testid="commit-ai-cancel"
        >
          {#if aiThinking}
            <span class="ai-spin"><Loader2 size={12} /></span>
            Thinking…
          {:else}
            <X size={12} /> Stop
          {/if}
        </button>
      {:else}
        <button
          type="button"
          class="ai-btn"
          onclick={generateWithAI}
          title="Generate with AI"
          data-testid="commit-ai-generate"
        >
          <Sparkles size={12} /> Generate
        </button>
      {/if}
    {/if}
  </div>

  <div class="actions-row">
    <label class="option">
      <input
        type="checkbox"
        checked={pushAfterCommit}
        onchange={(e) =>
          settingsStore.update({
            commit: {
              pushAfterCommit: (e.currentTarget as HTMLInputElement).checked,
            },
          })}
      />
      Push changes immediately to origin{currentBranch
        ? `/${currentBranch}`
        : ''}
    </label>
    <label class="option">
      <input type="checkbox" bind:checked={amend} />
      Amend last commit
    </label>
    <label class="option">
      <input
        type="checkbox"
        checked={noVerify}
        onchange={(e) =>
          settingsStore.update({
            commit: {
              noVerify: (e.currentTarget as HTMLInputElement).checked,
            },
          })}
      />
      Bypass commit hooks
    </label>
    <div class="actions-buttons">
      <button class="btn-cancel" onclick={onCancel}>Cancel</button>
      <button
        class="btn-commit"
        disabled={!message.trim() || !!aiRequestId}
        onclick={handleCommit}
      >
        Commit
      </button>
    </div>
  </div>
</div>

<style>
  .commit-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-top: 1px solid var(--color-border);
    background: var(--color-bg-surface);
    flex-shrink: 0;
  }

  .author-row {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 11px;
    color: var(--color-text-secondary);
  }

  .staging-hint {
    font-size: 10px;
    padding: 2px 8px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-secondary);
    background: var(--color-bg-base);
  }

  .author {
    color: var(--color-text-primary);
  }

  .email {
    color: var(--color-text-secondary);
  }

  .textarea-wrap {
    position: relative;
  }

  .commit-message {
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

  .commit-message:focus {
    border-color: var(--color-text-accent);
  }

  .ai-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-text-accent);
    color: var(--color-text-accent);
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
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

  .actions-row {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 11px;
    color: var(--color-text-secondary);
  }

  .option {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }

  .option input {
    accent-color: var(--color-text-accent);
  }

  .actions-buttons {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }

  .btn-cancel {
    padding: 4px 16px;
    border: 1px solid var(--color-border);
    background: var(--color-bg-toolbar);
    color: var(--color-text-primary);
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
  }

  .btn-cancel:hover {
    background: var(--color-bg-hover);
  }

  .btn-commit {
    padding: 4px 16px;
    border: none;
    background: #0e639c;
    color: white;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
  }

  .btn-commit:hover {
    background: #1177bb;
  }

  .btn-commit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
