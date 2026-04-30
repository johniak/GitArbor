/**
 * Renderer-side reactive store for AI feature gating. Read by the Generate
 * buttons in CreateBranchDialog and CommitPanel to decide whether to render.
 *
 * Hydration: each renderer entry that needs gating calls `aiStore.hydrate()`
 * once on mount. The store loads app settings + lists models, then subscribes
 * to settings + AI-state events so `modelReady` stays accurate when the user
 * downloads / removes models from the Settings window.
 */

import type { AIStateEvent, AppSettings, ModelEntry } from '../shared/ipc';

class AIStore {
  enabled = $state(false);
  selectedModelId = $state<string | null>(null);
  modelEntries = $state<ModelEntry[]>([]);
  hardware = $state<{ gpu: string; gpuName?: string; ramMB: number } | null>(
    null,
  );
  private offSettings?: () => void;
  private offState?: () => void;
  private hydrated = false;

  modelReady = $derived.by(() => {
    if (!this.enabled) return false;
    if (!this.selectedModelId) return false;
    const entry = this.modelEntries.find((m) => m.id === this.selectedModelId);
    return entry?.status === 'ready';
  });

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;
    try {
      const settings = await window.electronAPI.appSettings.get();
      this.applySettings(settings);
      this.modelEntries = await window.electronAPI.ai.listModels();
      this.hardware = await window.electronAPI.ai.getHardwareInfo();
    } catch (e) {
      console.error('[ai-store] hydrate failed:', e);
    }
    this.offSettings = window.electronAPI.appSettings.onChanged((next) => {
      this.applySettings(next);
      void this.refreshModels();
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
    this.selectedModelId = settings.ai.selectedModelId;
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
        break;
    }
  }
}

export const aiStore = new AIStore();
