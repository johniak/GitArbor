/**
 * Renderer-side reactive store for AI feature gating. Read by the Generate
 * buttons in CreateBranchDialog and CommitPanel to decide whether to render.
 *
 * Hydration: each renderer entry that needs gating calls `aiStore.hydrate()`
 * once on mount. The store loads app settings + asks main whether the
 * currently-selected source is ready, then subscribes to settings changes
 * + AI state events so `sourceReady` stays accurate as the user toggles
 * sources, fills in API keys, or downloads/removes local models.
 */

import type {
  AIStateEvent,
  AppSettings,
  ModelEntry,
  SourceReadyInfo,
} from '../shared/ipc';

class AIStore {
  enabled = $state(false);
  source = $state<AppSettings['ai']['source']>('local-llm');
  selectedModelId = $state<string | null>(null);
  modelEntries = $state<ModelEntry[]>([]);
  hardware = $state<{ gpu: string; gpuName?: string; ramMB: number } | null>(
    null,
  );
  /** Source-readiness probe result (from main). Refreshed on settings
   *  changes and AI state events. */
  ready = $state<SourceReadyInfo>({
    ready: false,
    source: 'local-llm',
    reason: 'AI disabled',
  });
  private offSettings?: () => void;
  private offState?: () => void;
  private hydrated = false;
  private refreshScheduled = false;

  /** Convenience boolean for visibility-gating Generate buttons. */
  sourceReady = $derived(this.ready.ready);

  /** Backwards-compat alias (consumers should migrate to `sourceReady`). */
  modelReady = $derived(this.ready.ready);

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;
    try {
      const settings = await window.electronAPI.appSettings.get();
      this.applySettings(settings);
      this.modelEntries = await window.electronAPI.ai.listModels();
      this.hardware = await window.electronAPI.ai.getHardwareInfo();
      this.ready = await window.electronAPI.ai.getSourceReady();
    } catch (e) {
      console.error('[ai-store] hydrate failed:', e);
    }
    this.offSettings = window.electronAPI.appSettings.onChanged((next) => {
      this.applySettings(next);
      this.scheduleRefresh();
    });
    this.offState = window.electronAPI.ai.onState((event) => {
      void this.handleStateEvent(event);
    });
  }

  dispose(): void {
    this.offSettings?.();
    this.offState?.();
    this.offSettings = undefined;
    this.offState = undefined;
    this.hydrated = false;
  }

  private applySettings(settings: AppSettings): void {
    this.enabled = settings.ai.enabled;
    this.source = settings.ai.source;
    this.selectedModelId = settings.ai.selectedModelId;
  }

  /** Coalesce burst settings updates into one refresh. */
  private scheduleRefresh(): void {
    if (this.refreshScheduled) return;
    this.refreshScheduled = true;
    queueMicrotask(async () => {
      this.refreshScheduled = false;
      await Promise.all([this.refreshModels(), this.refreshReady()]);
    });
  }

  private async refreshReady(): Promise<void> {
    try {
      this.ready = await window.electronAPI.ai.getSourceReady();
    } catch (e) {
      console.error('[ai-store] getSourceReady failed:', e);
    }
  }

  private async refreshModels(): Promise<void> {
    try {
      this.modelEntries = await window.electronAPI.ai.listModels();
    } catch (e) {
      console.error('[ai-store] listModels failed:', e);
    }
  }

  private async handleStateEvent(event: AIStateEvent): Promise<void> {
    switch (event.type) {
      case 'download-progress':
        this.modelEntries = this.modelEntries.map((m) =>
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
        break;
      case 'download-complete':
      case 'download-error':
      case 'model-ready':
      case 'model-unloaded':
        await this.refreshModels();
        await this.refreshReady();
        break;
    }
  }
}

export const aiStore = new AIStore();
