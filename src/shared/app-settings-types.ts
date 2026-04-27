/** UI theme preference. `system` follows the OS via Electron's nativeTheme. */
export type Appearance = 'system' | 'light' | 'dark';

export interface AppSettings {
  schemaVersion: 2;
  general: {
    authorName: string;
    authorEmail: string;
    /**
     * When true, git commits issued through the app use the authorName /
     * authorEmail above as GIT_AUTHOR_* and GIT_COMMITTER_* env vars. When
     * false, git uses whatever `git config` already provides. Either way,
     * the app never writes to `git config --global`.
     */
    overrideAuthorOnCommit: boolean;
    /**
     * Default parent folder for Clone / Create Local. Empty string means
     * "use the OS default" (typically ~).
     */
    projectFolder: string;
    /** Theme picker — `system` follows OS appearance changes in real time. */
    appearance: Appearance;
  };
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  schemaVersion: 2,
  general: {
    authorName: '',
    authorEmail: '',
    overrideAuthorOnCommit: false,
    projectFolder: '',
    appearance: 'system',
  },
};
