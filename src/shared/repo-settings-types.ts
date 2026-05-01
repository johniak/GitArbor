import {
  DEFAULT_COLUMN_WIDTHS,
  type ColumnWidths,
} from '../renderer/column-widths';
import type {
  FileSortMode,
  FileStatusFilter,
  FileViewMode,
  StagingMode,
} from '../renderer/lib/file-list-sort';

export interface RepoSettings {
  schemaVersion: 2;
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
    Worktrees: boolean;
  };
  fileList: {
    working: {
      viewMode: FileViewMode;
      sortMode: FileSortMode;
      statusFilter: FileStatusFilter;
      stagingMode: StagingMode;
    };
    historical: {
      viewMode: FileViewMode;
      sortMode: FileSortMode;
    };
  };
}

export const DEFAULT_REPO_SETTINGS: RepoSettings = {
  schemaVersion: 2,
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
    Worktrees: true,
  },
  fileList: {
    working: {
      viewMode: 'flat-single',
      sortMode: 'path-asc',
      statusFilter: 'pending',
      stagingMode: 'split',
    },
    historical: {
      viewMode: 'flat-single',
      sortMode: 'path-asc',
    },
  },
};
