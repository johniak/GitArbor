import { nativeTheme } from 'electron';
import type { Appearance } from '../shared/app-settings-types';

export type ResolvedTheme = 'light' | 'dark';

/**
 * Tell Electron's nativeTheme which appearance to follow. Setting
 * `themeSource` to a concrete value forces light/dark across renderer
 * media queries AND native chrome (Win10+ titlebar, macOS vibrancy,
 * GTK theme hint on Linux). 'system' hands the choice back to the OS.
 */
export function applyAppearance(setting: Appearance): void {
  nativeTheme.themeSource = setting;
}

/** Currently resolved theme — what the renderer should render. */
export function getResolvedTheme(): ResolvedTheme {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

/**
 * Subscribe to nativeTheme `updated` events. Fires both for our explicit
 * `applyAppearance` calls AND for OS-level changes when in 'system' mode
 * (e.g. macOS auto-switches to dark at sunset). Returns an unsubscribe
 * function.
 */
export function onResolvedThemeChange(
  cb: (theme: ResolvedTheme) => void,
): () => void {
  const handler = () => cb(getResolvedTheme());
  nativeTheme.on('updated', handler);
  return () => {
    nativeTheme.off('updated', handler);
  };
}
