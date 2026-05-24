export interface CacheEntry {
  value: string;
  fetchedAt: string;
}

export type Cache = Record<string, CacheEntry>;

export interface FreshResult {
  ok: boolean;
  value?: string;
}

export interface ResolveInput {
  key: string;
  fresh: FreshResult;
  cache: CacheEntry | undefined;
  now: Date;
}

export interface ResolveOutput {
  value?: string;
  cacheUpdate?: CacheEntry;
  warning?: string;
  error?: string;
}

const STALENESS_DAYS = 7;
const MS_PER_DAY = 86_400_000;

export function resolveMeta(input: ResolveInput): ResolveOutput {
  const { key, fresh, cache, now } = input;

  if (fresh.ok && fresh.value !== undefined) {
    return {
      value: fresh.value,
      cacheUpdate: { value: fresh.value, fetchedAt: now.toISOString() },
    };
  }

  if (!cache) {
    return { error: `No cache entry for ${key} and fresh fetch failed` };
  }

  const ageMs = now.getTime() - new Date(cache.fetchedAt).getTime();
  const ageDays = Math.floor(ageMs / MS_PER_DAY);

  if (ageDays > STALENESS_DAYS) {
    return {
      error: `Cache for ${key} is ${ageDays} days old (>${STALENESS_DAYS}); fresh fetch failed`,
    };
  }

  return {
    value: cache.value,
    warning: `Fell back to cache for ${key} (last fetched ${ageDays} day${ageDays === 1 ? '' : 's'} ago)`,
  };
}
