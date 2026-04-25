import {
  DEFAULT_REPO_SETTINGS,
  type DeepPartial,
  type RepoSettings,
} from '../shared/ipc';
import { deepMerge } from '../shared/deep-merge';

class SettingsStore {
  settings = $state<RepoSettings>({ ...DEFAULT_REPO_SETTINGS });
  ready = $state(false);

  async hydrate(): Promise<void> {
    try {
      this.settings = await window.electronAPI.settings.get();
    } catch (e) {
      console.error('[settings] hydrate failed:', e);
    } finally {
      this.ready = true;
    }
  }

  update(patch: DeepPartial<RepoSettings>): void {
    const next = deepMerge(this.settings, patch);
    if (next === this.settings) return; // no-op — skip IPC too
    this.settings = next;
    window.electronAPI.settings.update(patch).catch((e) => {
      console.error('[settings] update failed:', e);
    });
  }
}

export const settingsStore = new SettingsStore();
