import { describe, expect, it } from 'vitest';
import {
  resolveMeta,
  pickLatestTag,
  parsePushedAt,
  parseReleaseTag,
  parseTagNames,
  classifyRow,
  staticRow,
  renderSummary,
  type CacheEntry,
  type SummaryRow,
} from '../scripts/fetch-repo-meta';

const NOW = new Date('2026-05-23T12:00:00Z');
const fresh = (daysAgo: number): string =>
  new Date(NOW.getTime() - daysAgo * 86400_000).toISOString();

describe('resolveMeta', () => {
  it('returns the fetched value and updates the cache when fetch succeeds', () => {
    const result = resolveMeta({
      key: 'j-256/sh',
      fresh: { ok: true, value: '2026-05-20' },
      cache: undefined,
      now: NOW,
    });
    expect(result.value).toBe('2026-05-20');
    expect(result.warning).toBeUndefined();
    expect(result.error).toBeUndefined();
    expect(result.cacheUpdate).toEqual({
      value: '2026-05-20',
      fetchedAt: NOW.toISOString(),
    });
  });

  it('falls back to cache with a warning on fetch failure', () => {
    const cache: CacheEntry = { value: '2026-05-19', fetchedAt: fresh(3) };
    const result = resolveMeta({
      key: 'j-256/sh',
      fresh: { ok: false },
      cache,
      now: NOW,
    });
    expect(result.value).toBe('2026-05-19');
    expect(result.warning).toMatch(/Fell back to cache for j-256\/sh/);
    expect(result.warning).toMatch(/3 day/);
    expect(result.error).toBeUndefined();
    expect(result.cacheUpdate).toBeUndefined();
  });

  it('falls back to an arbitrarily old cache without erroring (staleness is advisory)', () => {
    // A stale fallback never breaks a build; the live build always fetches
    // fresh, so the committed cache only surfaces during a fetch failure.
    const cache: CacheEntry = { value: '2026-01-01', fetchedAt: fresh(120) };
    const result = resolveMeta({
      key: 'j-256/sh',
      fresh: { ok: false },
      cache,
      now: NOW,
    });
    expect(result.value).toBe('2026-01-01');
    expect(result.warning).toMatch(/120 days/);
    expect(result.error).toBeUndefined();
  });

  it('returns an error result when fetch fails and no cache exists', () => {
    const result = resolveMeta({
      key: 'j-256/sh',
      fresh: { ok: false },
      cache: undefined,
      now: NOW,
    });
    expect(result.value).toBeUndefined();
    expect(result.error).toMatch(/No cache entry for j-256\/sh/);
  });
});

describe('pickLatestTag', () => {
  it('picks the highest semver, not the first element', () => {
    // GitHub /tags ordering is not guaranteed to be latest-first.
    expect(pickLatestTag(['v1.0.0', 'v2.3.1', 'v1.9.0'])).toBe('v2.3.1');
  });

  it('compares numerically, not lexically (v1.10.0 > v1.9.0)', () => {
    expect(pickLatestTag(['v1.9.0', 'v1.10.0', 'v1.2.0'])).toBe('v1.10.0');
  });

  it('treats a release as higher than its pre-releases', () => {
    expect(pickLatestTag(['v1.0.0-rc.1', 'v1.0.0', 'v1.0.0-beta'])).toBe('v1.0.0');
  });

  it('orders pre-release identifiers when no final release exists', () => {
    expect(pickLatestTag(['v1.0.0-alpha', 'v1.0.0-rc.1', 'v1.0.0-beta'])).toBe('v1.0.0-rc.1');
  });

  it('ranks a numeric pre-release identifier below an alphanumeric one', () => {
    // SemVer 2.0: numeric identifiers always have lower precedence than non-numeric.
    expect(pickLatestTag(['v1.0.0-1', 'v1.0.0-alpha'])).toBe('v1.0.0-alpha');
  });

  it('ranks a longer pre-release set above its prefix', () => {
    // SemVer 2.0: when all shared identifiers are equal, more fields wins.
    expect(pickLatestTag(['v1.0.0-alpha', 'v1.0.0-alpha.1'])).toBe('v1.0.0-alpha.1');
  });

  it('tolerates tags with and without a leading v', () => {
    expect(pickLatestTag(['1.0.0', 'v1.4.0', '1.2.0'])).toBe('v1.4.0');
  });

  it('ignores tags that are not semver-shaped', () => {
    expect(pickLatestTag(['latest', 'v1.2.0', 'nightly', 'v1.3.0'])).toBe('v1.3.0');
  });

  it('throws when the list is empty', () => {
    expect(() => pickLatestTag([])).toThrow(/no.*tag/i);
  });

  it('throws when no tag is semver-shaped', () => {
    expect(() => pickLatestTag(['latest', 'nightly'])).toThrow(/no.*semver/i);
  });
});

describe('parsePushedAt', () => {
  it('returns the date portion of a valid pushed_at', () => {
    expect(parsePushedAt({ pushed_at: '2026-05-20T07:28:49Z' })).toBe('2026-05-20');
  });

  it('throws on a missing pushed_at', () => {
    expect(() => parsePushedAt({} as never)).toThrow(/pushed_at/);
  });

  it('throws on a non-string pushed_at', () => {
    expect(() => parsePushedAt({ pushed_at: 12345 } as never)).toThrow(/pushed_at/);
  });

  it('throws on a non-object body', () => {
    expect(() => parsePushedAt(null as never)).toThrow();
  });

  it('throws when pushed_at is a string but not an ISO date', () => {
    expect(() => parsePushedAt({ pushed_at: 'not-a-date' } as never)).toThrow(/ISO date/);
  });
});

describe('parseReleaseTag', () => {
  it('returns tag_name from a valid release', () => {
    expect(parseReleaseTag({ tag_name: 'v3.0.1' })).toBe('v3.0.1');
  });

  it('throws on a missing tag_name', () => {
    expect(() => parseReleaseTag({} as never)).toThrow(/tag_name/);
  });

  it('throws on an empty tag_name', () => {
    expect(() => parseReleaseTag({ tag_name: '' })).toThrow(/tag_name/);
  });
});

describe('parseTagNames', () => {
  it('extracts names from a tag array', () => {
    expect(parseTagNames([{ name: 'v1.0.0' }, { name: 'v1.1.0' }])).toEqual([
      'v1.0.0',
      'v1.1.0',
    ]);
  });

  it('throws when the body is not an array', () => {
    expect(() => parseTagNames({} as never)).toThrow(/array/i);
  });

  it('throws when an element is missing a name', () => {
    expect(() => parseTagNames([{ name: 'v1.0.0' }, {} as never])).toThrow(/name/);
  });
});

describe('classifyRow', () => {
  const base = { repo: 'j-256/x', source: 'release' as const };
  // A fresh-fetch success carries a cacheUpdate; a cache fallback carries only a
  // value (+warning); an error carries neither value nor cacheUpdate. These
  // mirror resolveMeta's actual output contract.
  const freshOk = (value: string) => ({ value, cacheUpdate: { value, fetchedAt: NOW.toISOString() } });

  it('marks a fetched value that differs from cache as updated', () => {
    const row = classifyRow({ ...base, previous: 'v1.0.0', result: freshOk('v1.1.0') });
    expect(row.status).toBe('updated');
    expect(row.previous).toBe('v1.0.0');
    expect(row.current).toBe('v1.1.0');
  });

  it('marks a fetched value equal to cache as unchanged', () => {
    const row = classifyRow({ ...base, previous: 'v1.0.0', result: freshOk('v1.0.0') });
    expect(row.status).toBe('unchanged');
  });

  it('marks a value with no prior cache entry as added', () => {
    const row = classifyRow({ ...base, previous: undefined, result: freshOk('v1.0.0') });
    expect(row.status).toBe('added');
    expect(row.previous).toBeUndefined();
    expect(row.current).toBe('v1.0.0');
  });

  it('marks a fallback (value without a cacheUpdate) as cache', () => {
    const row = classifyRow({
      ...base,
      previous: 'v1.0.0',
      result: { value: 'v1.0.0', warning: 'fell back' },
    });
    expect(row.status).toBe('cache');
    expect(row.current).toBe('v1.0.0');
  });

  it('marks a result with no value as error', () => {
    const row = classifyRow({ ...base, previous: undefined, result: { error: 'boom' } });
    expect(row.status).toBe('error');
    expect(row.current).toBeUndefined();
  });

  // The point of threading resolveMeta's output through: the row reflects what
  // the resolver actually did, never a recomputed guess.
  it('agrees with resolveMeta: any cache + failed fetch is a cache fallback', () => {
    const staleCache: CacheEntry = { value: 'v1.0.0', fetchedAt: fresh(120) };
    const result = resolveMeta({ key: 'j-256/x', fresh: { ok: false }, cache: staleCache, now: NOW });
    const row = classifyRow({ ...base, previous: staleCache.value, result });
    expect(result.value).toBe('v1.0.0');
    expect(row.status).toBe('cache');
    expect(row.current).toBe('v1.0.0');
  });

  it('agrees with resolveMeta: a failed fetch with no cache is error', () => {
    const result = resolveMeta({ key: 'j-256/x', fresh: { ok: false }, cache: undefined, now: NOW });
    const row = classifyRow({ ...base, previous: undefined, result });
    expect(result.error).toBeDefined();
    expect(row.status).toBe('error');
    expect(row.current).toBeUndefined();
  });
});

describe('staticRow', () => {
  it('represents a literal-meta project with a static source and no run outcome', () => {
    const row = staticRow({ repo: 'j-256/plugin_rootfile', value: 'stable' });
    expect(row.source).toBe('static');
    expect(row.current).toBe('stable');
    // Never fetched: no prior-versus-current transition and no run-outcome status.
    expect(row.previous).toBeUndefined();
    expect(row.status).toBeUndefined();
  });
});

describe('renderSummary', () => {
  const rows: SummaryRow[] = [
    { repo: 'j-256/sh', source: 'pushed', previous: '2026-05-14', current: '2026-06-08', status: 'updated' },
    { repo: 'j-256/ccam', source: 'release', previous: 'v0.1.1', current: 'v0.1.1', status: 'unchanged' },
    { repo: 'j-256/new', source: 'tag', previous: undefined, current: 'v1.0.0', status: 'added' },
    { repo: 'j-256/down', source: 'release', previous: 'v2.0.0', current: 'v2.0.0', status: 'cache' },
    { repo: 'j-256/pinned', source: 'static', previous: undefined, current: 'stable' },
  ];

  it('renders a markdown table with a header and one row per project', () => {
    const md = renderSummary(rows);
    expect(md).toMatch(/^### Repo metadata/m);
    expect(md).toMatch(/\| Project \| Source \| Previous \| Current \| Status \|/);
    expect(md.match(/^\| j-256\//gm)).toHaveLength(5);
  });

  it('shows the old to new transition for an updated row', () => {
    const md = renderSummary(rows);
    expect(md).toMatch(/j-256\/sh.*pushed.*2026-05-14.*2026-06-08.*updated/);
  });

  it('renders a static (literal-meta) row with a value but no status', () => {
    const md = renderSummary(rows);
    // Source carries "static"; Status is a dash because nothing ran.
    expect(md).toMatch(/j-256\/pinned \| static \| - \| stable \| - \|/);
  });

  it('summarizes counts in a roll-up line', () => {
    const md = renderSummary(rows);
    expect(md).toMatch(/1 updated/);
    expect(md).toMatch(/1 added/);
    expect(md).toMatch(/1 unchanged/);
    expect(md).toMatch(/1 from cache/);
    expect(md).toMatch(/1 static/);
  });

  it('renders a dash for an absent previous value', () => {
    const md = renderSummary([rows[2]]);
    expect(md).toMatch(/j-256\/new \| tag \| - \| v1.0.0/);
  });

  it('renders a dash placeholder for a missing current value on error', () => {
    const md = renderSummary([
      { repo: 'j-256/gone', source: 'release', previous: undefined, current: undefined, status: 'error' },
    ]);
    expect(md).toMatch(/j-256\/gone \| release \| - \| - \| .*ERROR/);
  });
});
