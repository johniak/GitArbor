import { describe, it, expect } from 'vitest';
import { buildCustomId } from './ai-service';

describe('buildCustomId', () => {
  it('returns a stable, sanitized id for the same URL', () => {
    const url = 'https://huggingface.co/foo/bar.gguf';
    const a = buildCustomId(url);
    const b = buildCustomId(url);
    expect(a).toBe(b);
    expect(a).toMatch(/^custom_[a-f0-9]{12}$/);
  });

  it('produces different ids for different URLs', () => {
    const a = buildCustomId('https://huggingface.co/foo/a.gguf');
    const b = buildCustomId('https://huggingface.co/foo/b.gguf');
    expect(a).not.toBe(b);
  });
});
