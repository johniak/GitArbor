import { describe, it, expect } from 'vitest';
import { extractDeltaFromJson, makeNdjsonParser } from './coding-agent';

describe('coding-agent: extractDeltaFromJson', () => {
  it('extracts text from Anthropic content_block_delta events', () => {
    const ev = { type: 'content_block_delta', delta: { text: 'hi' } };
    expect(extractDeltaFromJson(ev)).toBe('hi');
  });

  it('extracts text from Claude Code stream-json assistant events', () => {
    const ev = {
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: ' world' },
        ],
      },
    };
    expect(extractDeltaFromJson(ev)).toBe('Hello world');
  });

  it('extracts delta from Codex agent_message_delta events', () => {
    expect(
      extractDeltaFromJson({ type: 'agent_message_delta', delta: 'tok' }),
    ).toBe('tok');
  });

  it('extracts delta from Codex events nested under msg', () => {
    expect(
      extractDeltaFromJson({
        msg: { type: 'agent_message_delta', delta: 'inner' },
      }),
    ).toBe('inner');
  });

  it('returns empty string for unrelated events', () => {
    expect(extractDeltaFromJson({ type: 'tool_use' })).toBe('');
    expect(extractDeltaFromJson(null)).toBe('');
    expect(extractDeltaFromJson('not-an-object')).toBe('');
  });
});

describe('coding-agent: makeNdjsonParser', () => {
  it('parses one JSON object per newline', () => {
    const parsed: unknown[] = [];
    const feed = makeNdjsonParser((o) => parsed.push(o));
    feed('{"a":1}\n{"b":2}\n');
    expect(parsed).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('buffers across split chunks', () => {
    const parsed: unknown[] = [];
    const feed = makeNdjsonParser((o) => parsed.push(o));
    feed('{"a":');
    feed('1}\n{"b":2}\n');
    expect(parsed).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('silently skips malformed lines', () => {
    const parsed: unknown[] = [];
    const feed = makeNdjsonParser((o) => parsed.push(o));
    feed('garbage\n{"good":true}\nmore-garbage\n');
    expect(parsed).toEqual([{ good: true }]);
  });

  it('ignores empty lines', () => {
    const parsed: unknown[] = [];
    const feed = makeNdjsonParser((o) => parsed.push(o));
    feed('\n\n{"x":1}\n\n');
    expect(parsed).toEqual([{ x: 1 }]);
  });
});
