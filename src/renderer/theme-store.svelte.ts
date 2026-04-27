/**
 * Per-window theme bootstrap. Each entry-point (main App, Repository
 * Browser, Settings) calls `themeStore.hydrate()` once on mount. The
 * store queries the resolved theme from the main process, mirrors it
 * onto `<html data-theme>` and into localStorage (so the next launch
 * can paint the correct background before this code even runs — see
 * the inline anti-FOUC script in each *.html file), and subscribes to
 * future updates pushed by Electron's `nativeTheme.on('updated')`.
 */
const STORAGE_KEY = 'gitarbor:theme';

class ThemeStore {
  resolved = $state<'light' | 'dark'>('dark');
  private off?: () => void;

  async hydrate(): Promise<void> {
    try {
      this.resolved = await window.electronAPI.theme.getResolved();
    } catch (e) {
      console.error('[theme] getResolved failed:', e);
    }
    this.applyToDocument();
    this.off = window.electronAPI.theme.onResolved((next) => {
      this.resolved = next;
      this.applyToDocument();
    });
  }

  /** Detach the IPC listener — only used in tests. */
  dispose(): void {
    this.off?.();
    this.off = undefined;
  }

  private applyToDocument(): void {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', this.resolved);
    try {
      localStorage.setItem(STORAGE_KEY, this.resolved);
    } catch {
      /* localStorage unavailable in some sandboxed contexts — ignore */
    }
  }
}

export const themeStore = new ThemeStore();
