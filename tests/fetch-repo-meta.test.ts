import { describe, expect, it } from 'vitest';
import { resolveMeta, type CacheEntry } from '../scripts/fetch-repo-meta';

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

  it('returns an error result for stale cache (>7 days) on fetch failure', () => {
    const cache: CacheEntry = { value: '2026-05-01', fetchedAt: fresh(10) };
    const result = resolveMeta({
      key: 'j-256/sh',
      fresh: { ok: false },
      cache,
      now: NOW,
    });
    expect(result.value).toBeUndefined();
    expect(result.error).toMatch(/Cache for j-256\/sh is 10 days old/);
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

  it('treats exactly-7-days as still fresh (boundary)', () => {
    const cache: CacheEntry = { value: 'x', fetchedAt: fresh(7) };
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
