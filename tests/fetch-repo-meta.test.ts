import { describe, expect, it } from 'vitest';
import {
  resolveMeta,
  pickLatestTag,
  parsePushedAt,
  parseReleaseTag,
  parseTagNames,
  type CacheEntry,
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

  it('falls back to fresh cache (<=7 days old) with a warning on fetch failure', () => {
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

  it('returns an error result for stale cache (>14 days) on fetch failure', () => {
    const cache: CacheEntry = { value: '2026-05-01', fetchedAt: fresh(15) };
    const result = resolveMeta({
      key: 'j-256/sh',
      fresh: { ok: false },
      cache,
      now: NOW,
    });
    expect(result.value).toBeUndefined();
    expect(result.error).toMatch(/Cache for j-256\/sh is 15 days old/);
  });

  it('still falls back to cache at 10 days old (within the 14-day window)', () => {
    const cache: CacheEntry = { value: '2026-05-13', fetchedAt: fresh(10) };
    const result = resolveMeta({
      key: 'j-256/sh',
      fresh: { ok: false },
      cache,
      now: NOW,
    });
    expect(result.value).toBe('2026-05-13');
    expect(result.warning).toMatch(/10 days/);
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

  it('treats exactly-14-days as still fresh (boundary)', () => {
    const cache: CacheEntry = { value: 'x', fetchedAt: fresh(14) };
    const result = resolveMeta({
      key: 'j-256/sh',
      fresh: { ok: false },
      cache,
      now: NOW,
    });
    expect(result.value).toBe('x');
    expect(result.warning).toBeDefined();
    expect(result.error).toBeUndefined();
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
