import { describe, it, expect } from 'vitest';
import { planToTodoAndMessages } from './interactive-rebase';
import type { RebasePlan, RebaseStep } from '../shared/rebase-types';

const step = (
  hash: string,
  subject: string,
  action: RebaseStep['action'] = 'pick',
  newMessage?: string,
): RebaseStep => ({
  hash,
  hashShort: hash.slice(0, 7),
  subject,
  authorName: 'X',
  authorEmail: 'x@x',
  date: '2026-01-01T00:00:00Z',
  parents: [],
  refs: [],
  action,
  newMessage,
});

const plan = (steps: RebaseStep[]): RebasePlan => ({
  baseHash: 'base',
  steps,
});

describe('planToTodoAndMessages', () => {
  it('default pick generates oldest-first todo', () => {
    // UI order: newest-first → C, B, A
    const result = planToTodoAndMessages(
      plan([step('c', 'C'), step('b', 'B'), step('a', 'A')]),
    );
    expect(result.todoText).toBe('pick a A\npick b B\npick c C\n');
    expect(result.queuedMessages).toEqual([]);
  });

  it('drop omits the line entirely', () => {
    const result = planToTodoAndMessages(
      plan([step('c', 'C'), step('b', 'B', 'drop'), step('a', 'A')]),
    );
    expect(result.todoText).toBe('pick a A\npick c C\n');
    expect(result.queuedMessages).toEqual([]);
  });

  it('reword emits reword line and queues new message', () => {
    const result = planToTodoAndMessages(
      plan([
        step('c', 'C'),
        step('b', 'B', 'reword', 'B updated'),
        step('a', 'A'),
      ]),
    );
    expect(result.todoText).toBe('pick a A\nreword b B\npick c C\n');
    expect(result.queuedMessages).toEqual(['B updated']);
  });

  it('reword without explicit newMessage falls back to subject', () => {
    const result = planToTodoAndMessages(plan([step('a', 'A', 'reword')]));
    expect(result.queuedMessages).toEqual(['A']);
  });

  it('edit emits edit line and queues no message', () => {
    const result = planToTodoAndMessages(
      plan([step('c', 'C'), step('b', 'B', 'edit'), step('a', 'A')]),
    );
    expect(result.todoText).toBe('pick a A\nedit b B\npick c C\n');
    expect(result.queuedMessages).toEqual([]);
  });

  it('squash emits squash line after its target and queues message', () => {
    // UI: B (newer) squashes into A (older). Expected todo: pick A, squash B.
    const result = planToTodoAndMessages(
      plan([step('b', 'B', 'squash', 'combined A+B'), step('a', 'A')]),
    );
    expect(result.todoText).toBe('pick a A\nsquash b B\n');
    expect(result.queuedMessages).toEqual(['combined A+B']);
  });

  it('multi-action plan preserves chronological todo order', () => {
    // UI newest-first: D pick, C reword, B drop, A pick
    const result = planToTodoAndMessages(
      plan([
        step('d', 'D'),
        step('c', 'C', 'reword', 'C v2'),
        step('b', 'B', 'drop'),
        step('a', 'A'),
      ]),
    );
    expect(result.todoText).toBe('pick a A\nreword c C\npick d D\n');
    expect(result.queuedMessages).toEqual(['C v2']);
  });

  it('reword + squash queue messages in todo order', () => {
    // UI newest-first: D, C(squash→B), B(reword), A
    // Todo order (oldest-first): A, B (reword), C (squash), D
    const result = planToTodoAndMessages(
      plan([
        step('d', 'D'),
        step('c', 'C', 'squash', 'B+C combined'),
        step('b', 'B', 'reword', 'B renamed'),
        step('a', 'A'),
      ]),
    );
    expect(result.todoText).toBe(
      'pick a A\nreword b B\nsquash c C\npick d D\n',
    );
    expect(result.queuedMessages).toEqual(['B renamed', 'B+C combined']);
  });

  it('only-drops produces empty todo (caller should refuse)', () => {
    const result = planToTodoAndMessages(
      plan([step('a', 'A', 'drop'), step('b', 'B', 'drop')]),
    );
    expect(result.todoText).toBe('\n');
    expect(result.queuedMessages).toEqual([]);
  });
});
