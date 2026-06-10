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

// Two weeks: one missed weekly cron plus a transient fetch blip must not be
// enough to hard-fail a build. The committed cache is only a fallback anyway.
const STALENESS_DAYS = 14;
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

interface TagResponse {
  name: string;
}

interface Semver {
  major: number;
  minor: number;
  patch: number;
  /** Pre-release identifiers (the bit after `-`), already split on `.`. Empty means a final release. */
  pre: string[];
}

// Accepts an optional leading `v`, then major.minor.patch, then an optional
// `-prerelease`. Build metadata (`+...`) is ignored. Not a full SemVer 2.0
// grammar, just enough to order the tags this repo's projects actually publish.
const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseSemver(tag: string): Semver | null {
  const m = SEMVER_RE.exec(tag.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ? m[4].split('.') : [],
  };
}

// SemVer precedence: numeric fields high-to-low, then pre-release rules
// (a version WITH a pre-release is LOWER than the same without; identifiers
// compared left to right, numeric < numeric numerically, anything else
// lexically, numeric identifiers rank below non-numeric). Returns >0 if a
// outranks b, <0 if b outranks a, 0 if equal.
export function compareSemver(a: Semver, b: Semver): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  // A final release outranks any pre-release of the same numeric version.
  if (a.pre.length === 0 && b.pre.length > 0) return 1;
  if (a.pre.length > 0 && b.pre.length === 0) return -1;

  for (let i = 0; i < Math.min(a.pre.length, b.pre.length); i++) {
    const ai = a.pre[i];
    const bi = b.pre[i];
    if (ai === bi) continue;
    const aNum = /^\d+$/.test(ai);
    const bNum = /^\d+$/.test(bi);
    if (aNum && bNum) return Number(ai) - Number(bi);
    if (aNum) return -1; // numeric identifiers have lower precedence than alphanumeric
    if (bNum) return 1;
    return ai < bi ? -1 : 1;
  }
  // All shared identifiers equal: the longer pre-release set wins.
  return a.pre.length - b.pre.length;
}

/**
 * Pick the highest-precedence tag from a repo's tag list. GitHub's `/tags`
 * endpoint does NOT guarantee latest-first ordering, so taking `data[0]` is a
 * bug waiting on a second tag. Non-semver tags are ignored.
 */
export function pickLatestTag(tags: string[]): string {
  if (tags.length === 0) {
    throw new Error('no tags returned');
  }
  const parsed = tags
    .map((name) => ({ name, semver: parseSemver(name) }))
    .filter((t): t is { name: string; semver: Semver } => t.semver !== null);
  if (parsed.length === 0) {
    throw new Error(`no semver-shaped tag among: ${tags.join(', ')}`);
  }
  return parsed.reduce((best, t) => (compareSemver(t.semver, best.semver) > 0 ? t : best)).name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Validators for the GitHub responses we depend on. A 200 with an unexpected
// shape (API change, deprecation notice body) must throw here so the caller
// degrades to the cache rather than writing `undefined` into the page.
export function parsePushedAt(body: unknown): string {
  if (!isRecord(body) || typeof body.pushed_at !== 'string') {
    throw new Error('repo response missing string pushed_at');
  }
  const date = body.pushed_at.slice(0, 10);
  // Guard against a well-formed-but-nonsense 200 (the contract change the
  // validators exist to catch); a real GitHub response is always ISO-8601.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`pushed_at is not an ISO date: ${body.pushed_at}`);
  }
  return date;
}

export function parseReleaseTag(body: unknown): string {
  if (!isRecord(body) || typeof body.tag_name !== 'string' || body.tag_name === '') {
    throw new Error('release response missing non-empty tag_name');
  }
  return body.tag_name;
}

export function parseTagNames(body: unknown): string[] {
  if (!Array.isArray(body)) {
    throw new Error('tags response is not an array');
  }
  return body.map((t) => {
    if (!isRecord(t) || typeof t.name !== 'string') {
      throw new Error('tag entry missing string name');
    }
    return t.name;
  });
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
  return parsePushedAt(data);
}

async function fetchReleaseTag(repo: string): Promise<string> {
  const data = await ghFetch<ReleaseResponse>(
    `https://api.github.com/repos/${repo}/releases/latest`
  );
  return parseReleaseTag(data);
}

async function fetchLatestTag(repo: string): Promise<string> {
  const data = await ghFetch<TagResponse[]>(`https://api.github.com/repos/${repo}/tags`);
  return pickLatestTag(parseTagNames(data));
}

function isMetaSource(meta: Project['meta']): meta is MetaSource {
  return typeof meta === 'object' && meta !== null && 'source' in meta;
}

async function tryFetch(project: Project): Promise<{ ok: true; value: string } | { ok: false }> {
  if (!isMetaSource(project.meta)) {
    return { ok: true, value: project.meta };
  }
  try {
    let value: string;
    switch (project.meta.source) {
      case 'pushed':
        value = await fetchPushed(project.repo);
        break;
      case 'release':
        value = await fetchReleaseTag(project.repo);
        break;
      case 'tag':
        value = await fetchLatestTag(project.repo);
        break;
    }
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
  main().catch((err) => {
    console.error('fetch-repo-meta: unhandled error', err);
    process.exit(1);
  });
}
