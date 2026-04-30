import { describe, it, expect } from 'vitest';
import { extractContentFromChunk, makeSseParser } from './openai-compat';

describe('openai-compat: extractContentFromChunk', () => {
  it('returns the delta.content text from a typical streaming chunk', () => {
    const chunk = {
      choices: [{ delta: { content: 'hello' }, finish_reason: null }],
    };
    expect(extractContentFromChunk(chunk)).toBe('hello');
  });

  it('returns empty string for the role-only opening chunk', () => {
    const chunk = { choices: [{ delta: { role: 'assistant' } }] };
    expect(extractContentFromChunk(chunk)).toBe('');
  });

  it('returns empty string for the final stop chunk', () => {
    const chunk = { choices: [{ delta: {}, finish_reason: 'stop' }] };
    expect(extractContentFromChunk(chunk)).toBe('');
  });

  it('returns empty string for malformed input', () => {
    expect(extractContentFromChunk(null)).toBe('');
    expect(extractContentFromChunk('nope')).toBe('');
    expect(extractContentFromChunk({ choices: [] })).toBe('');
  });
});

describe('openai-compat: makeSseParser', () => {
  it('emits one event per `data:` line, terminated by blank line', () => {
    const events: string[] = [];
    const feed = makeSseParser((p) => events.push(p));
    feed('data: alpha\n\ndata: beta\n\n');
    expect(events).toEqual(['alpha', 'beta']);
  });

  it('buffers across split chunks until the boundary arrives', () => {
    const events: string[] = [];
    const feed = makeSseParser((p) => events.push(p));
    feed('data: hel');
    feed('lo\n');
    expect(events).toEqual([]);
    feed('\ndata: world\n\n');
    expect(events).toEqual(['hello', 'world']);
  });

  it('skips non-data SSE fields (event:, id:, retry:)', () => {
    const events: string[] = [];
    const feed = makeSseParser((p) => events.push(p));
    feed('event: ping\nid: 42\ndata: payload\n\n');
    expect(events).toEqual(['payload']);
  });

  it('passes the [DONE] sentinel through verbatim', () => {
    const events: string[] = [];
    const feed = makeSseParser((p) => events.push(p));
    feed('data: {"x":1}\n\ndata: [DONE]\n\n');
    expect(events).toEqual(['{"x":1}', '[DONE]']);
  });
});
