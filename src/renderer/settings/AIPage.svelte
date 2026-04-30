<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Cpu, Trash2, RotateCcw, X, Sparkles, Loader2 } from '@lucide/svelte';
  import type {
    AppSettings,
    HardwareInfo,
    ModelEntry,
    AIStateEvent,
  } from '../../shared/ipc';
  import { CURATED_MODELS } from '../../shared/ipc';

  type Props = {
    settings: AppSettings;
    onChange: (patch: Partial<AppSettings['ai']>) => void;
  };

  let { settings, onChange }: Props = $props();

  let enabled = $state(settings.ai.enabled);
  let selectedModelId = $state(settings.ai.selectedModelId);
  let customGgufUrl = $state(settings.ai.customGgufUrl);
  let customLabel = $state('');
  let keepModelLoaded = $state(settings.ai.keepModelLoaded);

  let hardware = $state<HardwareInfo | null>(null);
  let hardwareLoading = $state(true);
  let hardwareError = $state<string | null>(null);
  let models = $state<ModelEntry[]>([]);
  let off: (() => void) | undefined;

  let selectedEntry = $derived(
    selectedModelId === 'custom'
      ? null
      : (models.find((m) => m.id === selectedModelId) ?? null),
  );

  function gpuLabel(info: HardwareInfo): string {
    const base =
      info.gpu === 'metal'
        ? 'Apple Metal (GPU)'
        : info.gpu === 'cuda'
          ? 'NVIDIA CUDA (GPU)'
          : info.gpu === 'vulkan'
            ? 'Vulkan (GPU)'
            : 'CPU only';
    const parts = [base];
    if (info.gpuName) parts.push(info.gpuName);
    if (info.vramMB) parts.push(`${info.vramMB} MB VRAM`);
    parts.push(`${(info.ramMB / 1024).toFixed(1)} GB RAM`);
    return parts.join(' · ');
  }

  function formatBytes(bytes: number): string {
    if (!bytes) return '—';
    const mb = bytes / 1024 / 1024;
    if (mb < 1024) return `${mb.toFixed(0)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  }

  function formatRate(bytesPerSec: number): string {
    if (!bytesPerSec) return '—';
    const mb = bytesPerSec / 1024 / 1024;
    if (mb >= 1) return `${mb.toFixed(1)} MB/s`;
    return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  }

  async function refreshModels() {
    try {
      models = await window.electronAPI.ai.listModels();
    } catch (e) {
      console.error('[ai-page] listModels failed:', e);
    }
  }

  onMount(() => {
    // Fire both probes in parallel so the model list paints as soon as
    // it's ready, without waiting for the (potentially slow first-time)
    // native llama.cpp binary load to settle the hardware row.
    void refreshModels();
    void (async () => {
      hardwareLoading = true;
      hardwareError = null;
      try {
        hardware = await window.electronAPI.ai.getHardwareInfo();
      } catch (e) {
        console.error('[ai-page] hardware probe failed:', e);
        hardwareError = e instanceof Error ? e.message : String(e);
      } finally {
        hardwareLoading = false;
      }
    })();
    off = window.electronAPI.ai.onState((event: AIStateEvent) => {
      if (event.type === 'download-progress') {
        models = models.map((m) =>
          m.id === event.id
            ? {
                ...m,
                status: 'downloading',
                downloadProgress: {
                  receivedBytes: event.receivedBytes,
                  totalBytes: event.totalBytes,
                  bytesPerSec: event.bytesPerSec,
                },
              }
            : m,
        );
      } else {
        void refreshModels();
      }
    });
  });

  onDestroy(() => off?.());

  function handleEnableToggle() {
    onChange({ enabled });
  }

  function handleModelChange() {
    onChange({ selectedModelId });
  }

  function handleKeepLoadedToggle() {
    onChange({ keepModelLoaded });
  }

  async function startCuratedDownload(id: string) {
    const r = await window.electronAPI.ai.downloadModel({ id });
    if (r.error) {
      alert(`Download failed: ${r.error}`);
      return;
    }
    await refreshModels();
  }

  async function startCustomDownload() {
    if (!customGgufUrl.trim()) {
      alert('Paste a HuggingFace GGUF URL first.');
      return;
    }
    onChange({ customGgufUrl: customGgufUrl.trim() });
    if (
      !customGgufUrl.startsWith('https://huggingface.co/') &&
      !confirm(
        'This URL is not on huggingface.co. Continue anyway? Make sure the file is a valid GGUF model.',
      )
    ) {
      return;
    }
    const r = await window.electronAPI.ai.downloadModel({
      id: 'custom',
      url: customGgufUrl.trim(),
      label: customLabel.trim() || undefined,
    });
    if (r.error) {
      alert(`Download failed: ${r.error}`);
      return;
    }
    if (r.id) {
      selectedModelId = r.id;
      onChange({ selectedModelId: r.id });
    }
    customLabel = '';
    await refreshModels();
  }

  async function cancelDownload(id: string) {
    await window.electronAPI.ai.cancelDownload(id);
  }

  async function removeModel(id: string) {
    if (!confirm('Delete this downloaded model file?')) return;
    await window.electronAPI.ai.removeModel(id);
    await refreshModels();
  }

  let downloadedExtras = $derived(
    models.filter(
      (m) =>
        m.status === 'ready' &&
        m.id !== selectedModelId &&
        !CURATED_MODELS.find((c) => c.id === m.id),
    ),
  );
</script>

<div class="page">
  <label class="checkbox-row top-checkbox">
    <input
      type="checkbox"
      bind:checked={enabled}
      onchange={handleEnableToggle}
      data-testid="settings-ai-enabled"
    />
    <span>
      Enable AI features (local LLM for branch names + commit messages)
    </span>
  </label>

  <fieldset class="group">
    <legend>Hardware</legend>
    <div class="hardware">
      {#if hardwareLoading}
        <span class="spinner" aria-label="Detecting hardware">
          <Loader2 size={16} />
        </span>
        <span class="hardware-loading">Detecting GPU support…</span>
      {:else if hardwareError}
        <Cpu size={16} />
        <span class="hardware-error"
          >Detection failed — falling back to CPU. {hardwareError}</span
        >
      {:else if hardware}
        <Cpu size={16} />
        <span>{gpuLabel(hardware)}</span>
      {/if}
    </div>
  </fieldset>

  <fieldset class="group" disabled={!enabled}>
    <legend>Model</legend>

    <div class="field">
      <label for="settings-ai-model">Choose model:</label>
      <select
        id="settings-ai-model"
        bind:value={selectedModelId}
        onchange={handleModelChange}
        data-testid="settings-ai-model"
      >
        {#each CURATED_MODELS as m (m.id)}
          <option value={m.id}>
            {m.name} (~{formatBytes(m.sizeBytes)})
          </option>
        {/each}
        <option value="custom">Custom GGUF URL…</option>
      </select>
    </div>

    {#if selectedEntry}
      <div class="model-state">
        {#if selectedEntry.status === 'ready'}
          <span class="status-ok">
            <Sparkles size={12} /> Downloaded · {formatBytes(
              selectedEntry.sizeBytes,
            )}
          </span>
          <button
            type="button"
            class="btn-secondary"
            onclick={() => startCuratedDownload(selectedEntry.id)}
          >
            <RotateCcw size={12} /> Re-download
          </button>
          <button
            type="button"
            class="btn-secondary"
            onclick={() => removeModel(selectedEntry.id)}
          >
            <Trash2 size={12} /> Remove
          </button>
        {:else if selectedEntry.status === 'downloading'}
          {@const p = selectedEntry.downloadProgress}
          <div class="progress">
            <div class="progress-bar">
              <div
                class="progress-bar-fill"
                style:width={p && p.totalBytes
                  ? `${Math.min(100, (p.receivedBytes / p.totalBytes) * 100).toFixed(1)}%`
                  : '0%'}
              ></div>
            </div>
            <div class="progress-text">
              {p
                ? `${formatBytes(p.receivedBytes)} / ${formatBytes(p.totalBytes)} · ${formatRate(p.bytesPerSec)}`
                : 'Starting…'}
            </div>
          </div>
          <button
            type="button"
            class="btn-secondary"
            onclick={() => cancelDownload(selectedEntry.id)}
          >
            <X size={12} /> Cancel
          </button>
        {:else}
          <span class="status-pending">Not downloaded yet.</span>
          <button
            type="button"
            class="btn-primary-small"
            onclick={() => startCuratedDownload(selectedEntry.id)}
            data-testid="settings-ai-download"
          >
            Download
          </button>
        {/if}
      </div>
    {/if}

    {#if selectedModelId === 'custom'}
      <div class="field">
        <label for="settings-ai-custom-url">Custom GGUF URL:</label>
        <input
          id="settings-ai-custom-url"
          type="text"
          placeholder="https://huggingface.co/.../model.gguf"
          bind:value={customGgufUrl}
          onblur={() => onChange({ customGgufUrl })}
          data-testid="settings-ai-custom-url"
        />
      </div>
      <div class="field">
        <label for="settings-ai-custom-label">Label (optional):</label>
        <input
          id="settings-ai-custom-label"
          type="text"
          placeholder="My custom model"
          bind:value={customLabel}
        />
      </div>
      <div class="custom-actions">
        <button
          type="button"
          class="btn-primary-small"
          onclick={startCustomDownload}
        >
          Download custom
        </button>
      </div>
    {/if}

    {#if downloadedExtras.length > 0}
      <div class="downloaded-list">
        <div class="downloaded-header">Other downloaded models:</div>
        {#each downloadedExtras as m (m.id)}
          <div class="downloaded-row">
            <span class="downloaded-name">{m.name}</span>
            <span class="downloaded-size">{formatBytes(m.sizeBytes)}</span>
            <button
              type="button"
              class="btn-secondary"
              onclick={() => {
                selectedModelId = m.id;
                onChange({ selectedModelId: m.id });
              }}
            >
              Use
            </button>
            <button
              type="button"
              class="btn-secondary"
              onclick={() => removeModel(m.id)}
            >
              <Trash2 size={12} /> Remove
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <label class="checkbox-row keep-loaded">
      <input
        type="checkbox"
        bind:checked={keepModelLoaded}
        onchange={handleKeepLoadedToggle}
        data-testid="settings-ai-keep-loaded"
      />
      <span>
        Keep model loaded in memory
        <span class="hint">
          On — model stays in GPU/RAM the whole session, every Generate starts
          instantly. Off — model loads when you enter the commit view or open
          New Branch, unloads when you leave.
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

  .top-checkbox {
    font-size: 13px;
    color: var(--color-text-primary);
    display: flex;
    gap: 10px;
    align-items: flex-start;
    line-height: 1.4;
  }

  .checkbox-row input {
    accent-color: var(--color-text-accent);
    margin-top: 3px;
    flex-shrink: 0;
  }

  .group {
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 14px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .group[disabled] {
    opacity: 0.55;
  }

  .group legend {
    padding: 0 6px;
    font-size: 12px;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .hardware {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--color-text-primary);
    min-height: 18px;
  }

  .spinner {
    display: inline-flex;
    align-items: center;
    color: var(--color-text-accent);
    animation: ai-spin 1s linear infinite;
  }

  .hardware-loading {
    color: var(--color-text-secondary);
  }

  .hardware-error {
    color: var(--color-text-secondary);
    font-style: italic;
  }

  @keyframes ai-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .field {
    display: grid;
    grid-template-columns: 130px 1fr;
    gap: 12px;
    align-items: center;
  }

  .field label {
    color: var(--color-text-secondary);
    font-size: 12px;
    text-align: right;
  }

  .field input[type='text'],
  .field select {
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    padding: 5px 8px;
    border-radius: 4px;
    font-size: 13px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }

  .field input[type='text']:focus,
  .field select:focus {
    border-color: var(--color-text-accent);
  }

  .model-state {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding-left: 130px;
    font-size: 12px;
  }

  .status-ok {
    color: var(--color-text-primary);
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .status-pending {
    color: var(--color-text-secondary);
  }

  .progress {
    flex: 1;
    min-width: 220px;
  }

  .progress-bar {
    height: 4px;
    background: var(--color-border);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background: var(--color-text-accent);
    transition: width 120ms linear;
  }

  .progress-text {
    margin-top: 4px;
    font-size: 11px;
    color: var(--color-text-secondary);
  }

  .btn-primary-small {
    padding: 4px 14px;
    border: none;
    background: #0e639c;
    color: white;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    font-weight: 600;
  }

  .btn-primary-small:hover {
    background: #1177bb;
  }

  .btn-secondary {
    padding: 4px 10px;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .btn-secondary:hover {
    background: var(--color-bg-hover);
  }

  .custom-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .downloaded-list {
    margin-top: 6px;
    border-top: 1px dashed var(--color-border);
    padding-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .downloaded-header {
    font-size: 11px;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .downloaded-row {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
  }

  .downloaded-name {
    flex: 1;
    color: var(--color-text-primary);
  }

  .downloaded-size {
    color: var(--color-text-secondary);
  }

  .keep-loaded {
    margin-top: 6px;
    padding-top: 12px;
    border-top: 1px dashed var(--color-border);
    align-items: flex-start;
    gap: 10px;
    font-size: 13px;
    color: var(--color-text-primary);
  }

  .keep-loaded .hint {
    display: block;
    margin-top: 2px;
    font-size: 11px;
    color: var(--color-text-secondary);
    line-height: 1.4;
  }
</style>
