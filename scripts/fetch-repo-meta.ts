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

// 'static' covers projects whose meta is a literal string in projects.ts: they
// are never fetched, so the source itself carries the whole story and there is
// no run-outcome status. They get a row so they are not silently omitted.
export type MetaSourceKind = 'pushed' | 'release' | 'tag' | 'static';

// The outcome of a fetch-backed run. Static rows have no run outcome, so their
// status is undefined.
export type RowStatus = 'added' | 'updated' | 'unchanged' | 'cache' | 'error';

export interface SummaryRow {
  repo: string;
  source: MetaSourceKind;
  /** Value in the committed cache before this run (undefined if the repo was never cached). */
  previous?: string;
  /** Value after this run (undefined only when fetch failed and no cache could cover it). */
  current?: string;
  /** Run outcome. Undefined for static rows, which were never fetched. */
  status?: RowStatus;
}

export interface ClassifyInput {
  repo: string;
  source: MetaSourceKind;
  previous?: string;
  /** resolveMeta's verdict for this repo. The row is derived from this, never recomputed. */
  result: ResolveOutput;
}

const MS_PER_DAY = 86_400_000;

export function resolveMeta(input: ResolveInput): ResolveOutput {
  const { key, fresh, cache, now } = input;

  if (fresh.ok && fresh.value !== undefined) {
    return {
      value: fresh.value,
      cacheUpdate: { value: fresh.value, fetchedAt: now.toISOString() },
    };
  }

  // The only genuinely fatal case: no fresh value and nothing cached to show.
  if (!cache) {
    return { error: `No cache entry for ${key} and fresh fetch failed` };
  }

  // Fall back to the cached value regardless of age. Staleness is advisory, not
  // fatal: the live build always fetches fresh, so the committed cache only
  // surfaces during a fetch failure, where a slightly-old value beats no value
  // and beats failing the deploy. The warning records how old it was.
  const ageDays = Math.floor((now.getTime() - new Date(cache.fetchedAt).getTime()) / MS_PER_DAY);
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

/**
 * Decide how a single project's run turned out. Derived entirely from
 * resolveMeta's output so the summary can never disagree with what the build
 * actually did:
 *   - no value            -> error (build fails, nothing shipped)
 *   - value + cacheUpdate  -> a fresh fetch succeeded (added / unchanged / updated)
 *   - value, no cacheUpdate -> a cache fallback (fetch failed)
 * Pure: the build-summary table is built from these.
 */
export function classifyRow(input: ClassifyInput): SummaryRow {
  const { repo, source, previous, result } = input;
  const base = { repo, source, previous };

  if (result.value === undefined) {
    return { ...base, current: undefined, status: 'error' };
  }
  const current = result.value;
  if (!result.cacheUpdate) {
    return { ...base, current, status: 'cache' };
  }
  if (previous === undefined) return { ...base, current, status: 'added' };
  if (previous === current) return { ...base, current, status: 'unchanged' };
  return { ...base, current, status: 'updated' };
}

/**
 * Build a row for a literal-meta project (e.g. meta: 'stable'). These are never
 * fetched, so there is no previous-versus-current transition and no run-outcome
 * status: the value is pinned in projects.ts and shown verbatim. The 'static'
 * source carries the whole story; git history records any change to the value.
 */
export function staticRow(input: { repo: string; value: string }): SummaryRow {
  return { repo: input.repo, source: 'static', current: input.value };
}

const STATUS_LABEL: Record<RowStatus, string> = {
  added: 'added',
  updated: 'updated',
  unchanged: 'unchanged',
  cache: 'from cache (fetch failed)',
  error: 'ERROR (no value)',
};

/** Render the per-project results as a GitHub step-summary markdown block. */
export function renderSummary(rows: SummaryRow[]): string {
  const dash = (v: string | undefined): string => (v === undefined || v === '' ? '-' : v);

  const lines = [
    // Top-level (##) so it sits as a sibling of the Vitest report's heading in
    // the job summary, not nested as one of its subsections.
    '## Repo metadata',
    '',
    '| Project | Source | Previous | Current | Status |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const r of rows) {
    const status = r.status ? STATUS_LABEL[r.status] : '-';
    lines.push(
      `| ${r.repo} | ${r.source} | ${dash(r.previous)} | ${dash(r.current)} | ${status} |`
    );
  }

  const counts: Record<RowStatus, number> = {
    added: 0,
    updated: 0,
    unchanged: 0,
    cache: 0,
    error: 0,
  };
  for (const r of rows) {
    if (r.status) counts[r.status]++;
  }
  // Static rows have no status, so they are tallied by source instead.
  const staticCount = rows.filter((r) => r.source === 'static').length;

  // Roll-up: only mention non-zero buckets, but always show updated/added so a
  // quiet run still reads as a positive "nothing changed" rather than blank.
  const parts = [
    `${counts.updated} updated`,
    `${counts.added} added`,
    `${counts.unchanged} unchanged`,
  ];
  if (counts.cache > 0) parts.push(`${counts.cache} from cache`);
  if (counts.error > 0) parts.push(`${counts.error} error`);
  if (staticCount > 0) parts.push(`${staticCount} static`);

  lines.push('', `**${rows.length} project(s):** ${parts.join(', ')}.`);
  return lines.join('\n');
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
  const rows: SummaryRow[] = [];

  for (const project of projects) {
    // Literal-meta projects are never fetched; surface them as static rows
    // rather than dropping them from the summary.
    if (!isMetaSource(project.meta)) {
      rows.push(staticRow({ repo: project.repo, value: project.meta }));
      continue;
    }

    // Capture the prior value before resolveMeta mutates the cache below.
    const previous = cache[project.repo]?.value;
    const fresh = await tryFetch(project);
    const result = resolveMeta({
      key: project.repo,
      fresh,
      cache: cache[project.repo],
      now,
    });

    rows.push(classifyRow({ repo: project.repo, source: project.meta.source, previous, result }));

    if (result.cacheUpdate) {
      cache[project.repo] = result.cacheUpdate;
    }
    if (result.warning) {
      console.log(`::warning file=scripts/fetch-repo-meta.ts::${result.warning}`);
    }
    if (result.error) {
      console.log(`::error file=scripts/fetch-repo-meta.ts::${result.error}`);
      errors.push(result.error);
    }
  }

  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');
  await emitSummary(renderSummary(rows));

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
