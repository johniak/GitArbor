import {
  DEFAULT_COLUMN_WIDTHS,
  type ColumnWidths,
} from '../renderer/column-widths';

export interface RepoSettings {
  schemaVersion: 1;
  path: string;
  graph: { showAllBranches: boolean; logOrder: 'date' | 'topo' };
  columns: ColumnWidths;
  layout: {
    sidebarWidth: number;
    commitLogHeight: number;
    fileListWidth: number;
  };
  commit: {
    pushAfterCommit: boolean;
    noVerify: boolean;
    authorName: string;
    authorEmail: string;
  };
  resume: {
    lastSelectedHash: string | null;
    lastActiveView: 'history' | 'file-status' | 'search' | null;
  };
  sidebarSections: {
    Branches: boolean;
    Tags: boolean;
    Remotes: boolean;
    Stashes: boolean;
  };
}

export const DEFAULT_REPO_SETTINGS: RepoSettings = {
  schemaVersion: 1,
  path: '',
  graph: { showAllBranches: true, logOrder: 'topo' },
  columns: { ...DEFAULT_COLUMN_WIDTHS },
  layout: {
    sidebarWidth: 220,
    commitLogHeight: 300,
    fileListWidth: 260,
  },
  commit: {
    pushAfterCommit: false,
    noVerify: false,
    authorName: '',
    authorEmail: '',
  },
  resume: {
    lastSelectedHash: null,
    lastActiveView: null,
  },
  sidebarSections: {
    Branches: true,
    Tags: true,
    Remotes: true,
    Stashes: true,
  },
};
