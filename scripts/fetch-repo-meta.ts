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

import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { projects, type Project, type MetaSource } from '../src/data/projects';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = resolve(HERE, '../src/data/repo-meta.cache.json');

const TOKEN = process.env.GITHUB_TOKEN;
const SUMMARY_PATH = process.env.GITHUB_STEP_SUMMARY;

interface RepoResponse {
  pushed_at: string;
}

interface ReleaseResponse {
  tag_name: string;
}

async function ghFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub ${url} returned ${res.status}`);
  }
  return (await res.json()) as T;
}

async function fetchPushed(repo: string): Promise<string> {
  const data = await ghFetch<RepoResponse>(`https://api.github.com/repos/${repo}`);
  return data.pushed_at.slice(0, 10);
}

async function fetchReleaseTag(repo: string): Promise<string> {
  const data = await ghFetch<ReleaseResponse>(
    `https://api.github.com/repos/${repo}/releases/latest`
  );
  return data.tag_name;
}

function isMetaSource(meta: Project['meta']): meta is MetaSource {
  return typeof meta === 'object' && meta !== null && 'source' in meta;
}

async function tryFetch(project: Project): Promise<{ ok: true; value: string } | { ok: false }> {
  if (!isMetaSource(project.meta)) {
    return { ok: true, value: project.meta };
  }
  try {
    const value =
      project.meta.source === 'pushed'
        ? await fetchPushed(project.repo)
        : await fetchReleaseTag(project.repo);
    return { ok: true, value };
  } catch (err) {
    console.error(`fetch failed for ${project.repo}:`, err);
    return { ok: false };
  }
}

async function emitSummary(line: string): Promise<void> {
  if (SUMMARY_PATH) {
    await appendFile(SUMMARY_PATH, line + '\n');
  }
}

async function main(): Promise<void> {
  const cacheRaw = await readFile(CACHE_PATH, 'utf-8');
  const cache: Record<string, { value: string; fetchedAt: string }> = JSON.parse(cacheRaw);
  const now = new Date();
  const errors: string[] = [];

  for (const project of projects) {
    if (!isMetaSource(project.meta)) continue;

    const fresh = await tryFetch(project);
    const result = resolveMeta({
      key: project.repo,
      fresh,
      cache: cache[project.repo],
      now,
    });

    if (result.cacheUpdate) {
      cache[project.repo] = result.cacheUpdate;
    }
    if (result.warning) {
      console.log(`::warning file=scripts/fetch-repo-meta.ts::${result.warning}`);
      await emitSummary(`- WARN ${result.warning}`);
    }
    if (result.error) {
      console.log(`::error file=scripts/fetch-repo-meta.ts::${result.error}`);
      errors.push(result.error);
    }
  }

  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');

  if (errors.length > 0) {
    console.error(`fetch-repo-meta failed: ${errors.length} error(s)`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
