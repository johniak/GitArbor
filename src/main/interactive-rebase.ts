import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import simpleGit from 'simple-git';
import type {
  RebasePlan,
  RebaseStep,
  RunInteractiveRebaseResult,
} from '../shared/rebase-types';

/**
 * Node script written to disk per-rebase. Git invokes it as both the sequence
 * editor (target file: `git-rebase-todo`) and the commit message editor
 * (target file: `COMMIT_EDITMSG` or similar). The script reads our state JSON
 * (path provided via `GITARBOR_REBASE_STATE` env var) and writes the
 * appropriate content. Counter advances per commit-message invocation.
 */
const EDITOR_SCRIPT = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const stateFile = process.env.GITARBOR_REBASE_STATE;
const target = process.argv[2];
if (!stateFile || !target) process.exit(0);
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
if (path.basename(target) === 'git-rebase-todo') {
  fs.writeFileSync(target, state.todoText);
} else {
  const counter = state.counter || 0;
  if (counter < state.queuedMessages.length) {
    fs.writeFileSync(target, state.queuedMessages[counter]);
  }
  state.counter = counter + 1;
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}
`;

let tempBaseDir: string | null = null;

export function configureInteractiveRebase(baseDir: string): void {
  tempBaseDir = baseDir;
}

function tempDir(): string {
  return tempBaseDir ?? path.join(os.tmpdir(), 'gitarbor-rebase');
}

function repoHash(repoPath: string): string {
  return crypto
    .createHash('sha256')
    .update(repoPath)
    .digest('hex')
    .slice(0, 16);
}

function rebaseStateFile(repoPath: string): string {
  return path.join(tempDir(), `rebase-${repoHash(repoPath)}.json`);
}

function editorScriptPath(repoPath: string): string {
  return path.join(tempDir(), `editor-${repoHash(repoPath)}.cjs`);
}

function markerPath(repoPath: string): string {
  return path.join(tempDir(), `marker-${repoHash(repoPath)}`);
}

export function isInteractiveRebaseInProgress(repoPath: string): boolean {
  return fs.existsSync(markerPath(repoPath));
}

export function getEditorScriptPath(repoPath: string): string {
  return editorScriptPath(repoPath);
}

export function getRebaseStateFile(repoPath: string): string {
  return rebaseStateFile(repoPath);
}

/**
 * Convert a UI plan (newest-first) into a git-rebase-todo body (oldest-first)
 * plus the ordered list of commit messages that the editor script will emit.
 *
 * Limitations (v1):
 * - No chained squashes: each `squash` row is assumed to combine with one
 *   non-squash older neighbour. Multi-squash chains may misorder messages
 *   because git invokes the message editor only once per squash group.
 */
export function planToTodoAndMessages(plan: RebasePlan): {
  todoText: string;
  queuedMessages: string[];
} {
  const oldestFirst = [...plan.steps].reverse();
  const lines: string[] = [];
  const queuedMessages: string[] = [];

  for (const step of oldestFirst) {
    switch (step.action) {
      case 'pick':
        lines.push(`pick ${step.hash} ${step.subject}`);
        break;
      case 'reword':
        lines.push(`reword ${step.hash} ${step.subject}`);
        queuedMessages.push(step.newMessage ?? step.subject);
        break;
      case 'edit':
        lines.push(`edit ${step.hash} ${step.subject}`);
        break;
      case 'drop':
        // omit entirely
        break;
      case 'squash':
        lines.push(`squash ${step.hash} ${step.subject}`);
        queuedMessages.push(step.newMessage ?? step.subject);
        break;
    }
  }

  return {
    todoText: lines.join('\n') + '\n',
    queuedMessages,
  };
}

const COMMIT_FIELD_SEP = '\x1f';

export async function prepareRebasePlan(
  repoPath: string,
  baseHash: string,
): Promise<RebaseStep[]> {
  const git = simpleGit(repoPath);
  const formatTokens = ['%H', '%h', '%s', '%an', '%ae', '%aI', '%P', '%D'];
  const log = await git.raw([
    'log',
    `${baseHash}..HEAD`,
    '--reverse',
    `--format=${formatTokens.join(COMMIT_FIELD_SEP)}`,
  ]);

  const steps: RebaseStep[] = [];
  for (const line of log.split('\n')) {
    if (!line.trim()) continue;
    const [
      hash,
      hashShort,
      subject,
      authorName,
      authorEmail,
      date,
      parents,
      refs,
    ] = line.split(COMMIT_FIELD_SEP);
    steps.push({
      hash,
      hashShort,
      subject,
      authorName,
      authorEmail,
      date,
      parents: parents ? parents.split(' ').filter(Boolean) : [],
      refs: refs ? refs.split(', ').filter(Boolean) : [],
      action: 'pick',
    });
  }

  // UI is newest-first; reverse the oldest-first git log output.
  return steps.reverse();
}

function ensureTempDir(): void {
  const dir = tempDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function buildEditorCommand(scriptPath: string): string {
  // Node executable path with embedded spaces (macOS .app bundles) needs
  // quoting on each component so git can shell-parse it.
  return `"${process.execPath}" "${scriptPath}"`;
}

export async function runInteractiveRebase(
  repoPath: string,
  plan: RebasePlan,
): Promise<RunInteractiveRebaseResult> {
  ensureTempDir();

  const { todoText, queuedMessages } = planToTodoAndMessages(plan);

  const stateFile = rebaseStateFile(repoPath);
  const editorPath = editorScriptPath(repoPath);
  const marker = markerPath(repoPath);

  const state = {
    todoText,
    queuedMessages,
    counter: 0,
  };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  fs.writeFileSync(editorPath, EDITOR_SCRIPT, { mode: 0o755 });
  fs.writeFileSync(marker, repoPath);

  const editorCommand = buildEditorCommand(editorPath);

  // simple-git refuses GIT_EDITOR/GIT_SEQUENCE_EDITOR by default for safety;
  // unsafe.allowUnsafeEditor opts in. ELECTRON_RUN_AS_NODE makes the
  // Electron binary behave as a plain Node interpreter when git spawns it
  // as the editor (harmless when execPath is already a real Node).
  const git = simpleGit(repoPath, {
    unsafe: { allowUnsafeEditor: true },
  })
    .env('ELECTRON_RUN_AS_NODE', '1')
    .env('GITARBOR_REBASE_STATE', stateFile)
    .env('GIT_EDITOR', editorCommand)
    .env('GIT_SEQUENCE_EDITOR', editorCommand);

  try {
    await git.raw(['rebase', '-i', plan.baseHash]);
    cleanupInteractiveRebaseState(repoPath);
    return { conflicts: [], summary: 'Rebase completed' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    let conflicts: string[] = [];
    try {
      const status = await simpleGit(repoPath).status();
      conflicts = status.conflicted;
    } catch {
      // ignore status read failure
    }
    if (conflicts.length > 0) {
      // Pause for conflict resolution; keep state so continueOperation can
      // re-supply the editor with the queued messages.
      return {
        conflicts,
        summary: 'Conflicts during rebase',
      };
    }
    cleanupInteractiveRebaseState(repoPath);
    return { conflicts: [], summary: '', error: msg };
  }
}

export function cleanupInteractiveRebaseState(repoPath: string): void {
  for (const p of [
    rebaseStateFile(repoPath),
    editorScriptPath(repoPath),
    markerPath(repoPath),
  ]) {
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Hook for `continueOperation` in git-service: build the env vars that route
 * git's editors back to our editor.cjs, so reword/squash messages survive a
 * conflict-resolution pause.
 */
export function interactiveRebaseContinueEnv(repoPath: string): {
  ELECTRON_RUN_AS_NODE: string;
  GITARBOR_REBASE_STATE: string;
  GIT_EDITOR: string;
  GIT_SEQUENCE_EDITOR: string;
} | null {
  if (!isInteractiveRebaseInProgress(repoPath)) return null;
  const editorCommand = buildEditorCommand(editorScriptPath(repoPath));
  return {
    ELECTRON_RUN_AS_NODE: '1',
    GITARBOR_REBASE_STATE: rebaseStateFile(repoPath),
    GIT_EDITOR: editorCommand,
    GIT_SEQUENCE_EDITOR: editorCommand,
  };
}

/** Reset all process-state for tests. */
export function _resetInteractiveRebaseState(): void {
  tempBaseDir = null;
}
