/**
 * Pure parser for `git blame --porcelain <path>` output.
 *
 * Porcelain format (from git docs):
 *
 *   <40-char-sha> <orig-line> <final-line> [<num-lines>]
 *   author <name>
 *   author-mail <email>
 *   author-time <unix-seconds>
 *   author-tz <±HHMM>
 *   committer <name>
 *   committer-mail <email>
 *   committer-time <unix-seconds>
 *   committer-tz <±HHMM>
 *   summary <first line of commit message>
 *   previous <sha> <path>           (optional)
 *   filename <path>
 *   <TAB><raw line content>
 *
 * The author / committer / summary block is **only emitted for the first
 * line of every contiguous sha-group**. Subsequent lines in the same group
 * carry just the header + filename + content lines.
 *
 * The parser tracks per-sha metadata in a cache so it can attach the
 * already-seen author info to follow-up lines.
 */

export interface BlameLine {
  /** Full 40-char commit hash. Special "uncommitted" sha = 40 zeros. */
  hash: string;
  /** First 7 chars of `hash`. */
  hashShort: string;
  authorName: string;
  authorEmail: string;
  /** ISO-8601 author date (e.g. `2026-04-28T12:34:56+02:00`). */
  date: string;
  /** 1-based final-file line number. */
  lineNumber: number;
  /** Raw line content, no trailing newline. */
  content: string;
}

interface ShaMeta {
  authorName: string;
  authorEmail: string;
  /** Unix seconds. */
  authorTime: number;
  /** Timezone string `±HHMM`. */
  authorTz: string;
}

/**
 * Convert a porcelain dump into one BlameLine per file line, in file
 * order. Returns `[]` for empty input. Tolerates malformed sections
 * (e.g. a header with no content) by skipping them rather than throwing.
 */
export function parseBlamePorcelain(raw: string): BlameLine[] {
  if (!raw) return [];

  const lines = raw.split('\n');
  const shaCache = new Map<string, ShaMeta>();
  const out: BlameLine[] = [];

  let i = 0;
  while (i < lines.length) {
    const header = lines[i];
    // Header pattern: <sha> <orig-line> <final-line> [<num-lines>]
    const match = header.match(/^([0-9a-f]{40})\s+(\d+)\s+(\d+)(?:\s+\d+)?$/);
    if (!match) {
      i += 1;
      continue;
    }
    const [, sha, , finalLineStr] = match;
    const finalLine = Number(finalLineStr);

    // Optional metadata block — present for the first line of each sha-group.
    let meta = shaCache.get(sha);
    const pendingMeta: Partial<ShaMeta> = meta ? { ...meta } : {};
    i += 1;
    while (i < lines.length && lines[i] && !lines[i].startsWith('\t')) {
      const kv = lines[i];
      // key value (single space separator)
      const spaceIdx = kv.indexOf(' ');
      const key = spaceIdx === -1 ? kv : kv.slice(0, spaceIdx);
      const value = spaceIdx === -1 ? '' : kv.slice(spaceIdx + 1);
      switch (key) {
        case 'author':
          pendingMeta.authorName = value;
          break;
        case 'author-mail':
          // Strip surrounding angle brackets if present.
          pendingMeta.authorEmail = value.replace(/^<|>$/g, '');
          break;
        case 'author-time':
          pendingMeta.authorTime = Number(value);
          break;
        case 'author-tz':
          pendingMeta.authorTz = value;
          break;
        // committer / summary / previous / filename ignored — not needed.
      }
      i += 1;
    }

    // Cache or refresh meta if we got a full set this round.
    if (
      pendingMeta.authorName !== undefined &&
      pendingMeta.authorEmail !== undefined &&
      pendingMeta.authorTime !== undefined &&
      pendingMeta.authorTz !== undefined
    ) {
      meta = {
        authorName: pendingMeta.authorName,
        authorEmail: pendingMeta.authorEmail,
        authorTime: pendingMeta.authorTime,
        authorTz: pendingMeta.authorTz,
      };
      shaCache.set(sha, meta);
    }

    // Content line — `\t` followed by raw content.
    if (i >= lines.length || !lines[i].startsWith('\t')) {
      // Malformed group — no content, skip.
      continue;
    }
    const content = lines[i].slice(1);
    i += 1;

    if (!meta) {
      // Header without ever seeing meta — still emit a minimal line so
      // line numbers stay aligned with the file.
      out.push({
        hash: sha,
        hashShort: sha.slice(0, 7),
        authorName: '',
        authorEmail: '',
        date: '',
        lineNumber: finalLine,
        content,
      });
      continue;
    }

    out.push({
      hash: sha,
      hashShort: sha.slice(0, 7),
      authorName: meta.authorName,
      authorEmail: meta.authorEmail,
      date: isoFromUnix(meta.authorTime, meta.authorTz),
      lineNumber: finalLine,
      content,
    });
  }

  // Final line ordering — git emits in file order already, but defend
  // against malformed input by sorting by lineNumber as a safety net.
  out.sort((a, b) => a.lineNumber - b.lineNumber);
  return out;
}

function isoFromUnix(seconds: number, tz: string): string {
  // tz is `+HHMM` / `-HHMM`; convert to `+HH:MM` for ISO-8601.
  const tzNormalised = /^[+-]\d{4}$/.test(tz)
    ? `${tz.slice(0, 3)}:${tz.slice(3)}`
    : 'Z';
  const date = new Date(seconds * 1000);
  // Build ISO with the specified offset rather than UTC.
  const sign = tzNormalised.startsWith('-') ? -1 : 1;
  const [hh, mm] =
    tzNormalised === 'Z'
      ? [0, 0]
      : tzNormalised.slice(1).split(':').map(Number);
  const offsetMs = sign * (hh * 60 + mm) * 60_000;
  const local = new Date(date.getTime() + offsetMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}` +
    tzNormalised
  );
}
