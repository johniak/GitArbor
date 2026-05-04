import { DEFAULT_AI_SETTINGS, type AISettings } from './ai-types';

/** UI theme preference. `system` follows the OS via Electron's nativeTheme. */
export type Appearance = 'system' | 'light' | 'dark';

/** How the diff viewer renders changes. */
export type DiffViewMode = 'unified' | 'split';

export interface DiffSettings {
  viewMode: DiffViewMode;
  /** Apply Shiki syntax highlighting to diff line content. */
  syntaxHighlight: boolean;
  /** Highlight per-word differences in modification pairs (`-`/`+` lines
   *  that align in split view). */
  wordDiff: boolean;
}

/** Persistent defaults for the Pull dialog. The user can override per-pull
 *  in the dialog itself; whatever they confirm is written back here. */
export interface PullSettings {
  /** `git pull --rebase` instead of merge. Mutually exclusive with `noFf`
   *  and `log` (those are merge-only flags). */
  rebase: boolean;
  /** `--no-commit` — fetch + merge but leave the user to confirm. */
  noCommit: boolean;
  /** `--no-ff` — always create a merge commit even when fast-forward is
   *  possible. */
  noFf: boolean;
  /** `--log` — populate the merge commit message with shortlogs of the
   *  commits being merged in. */
  log: boolean;
}

export interface AppSettings {
  schemaVersion: 6;
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
  ai: AISettings;
  diff: DiffSettings;
  pull: PullSettings;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  schemaVersion: 6,
  general: {
    authorName: '',
    authorEmail: '',
    overrideAuthorOnCommit: false,
    projectFolder: '',
    appearance: 'system',
  },
  ai: DEFAULT_AI_SETTINGS,
  diff: {
    viewMode: 'unified',
    syntaxHighlight: true,
    wordDiff: true,
  },
  pull: {
    rebase: false,
    noCommit: false,
    noFf: false,
    log: false,
  },
};
