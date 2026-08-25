import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  PROJECT_META_SOURCE,
  projectListings,
  type ProjectMetaSource,
} from '../src/data/projects';
import {
  PROJECT_ASSET_DIRECTORY,
  PROJECT_COVER_PATH,
  PROJECT_SCREENSHOT_MAX_BYTES,
  assertProjectCoverImage,
  assertProjectRepository,
  projectCoverAssetPath,
} from '../src/lib/project-assets';
import { assertListedRepository } from '../src/lib/repo-visibility';

export interface CacheEntry {
  value: string;
  fetchedAt: string;
}

export interface ProjectCacheEntry extends CacheEntry {
  name: string;
  owner: string;
  description: string | null;
  url: string;
  coverWidth: number;
  coverHeight: number;
}

export type ProjectCache = Record<string, ProjectCacheEntry>;

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

export type MetaSourceKind = 'pushed' | 'release' | 'tag' | 'static';
export type RowStatus = 'fresh' | 'cache' | 'error';

export interface SummaryRow {
  repo: string;
  source: MetaSourceKind;
  value?: string;
  status?: RowStatus;
}

export interface ClassifyInput {
  repo: string;
  source: MetaSourceKind;
  result: ResolveOutput;
}

export interface RepositoryProfile {
  name: string;
  owner: string;
  description: string | null;
  url: string;
  defaultBranch: string;
}

interface ProjectSource {
  revision: string;
  cover: Uint8Array;
  contentType: string | null;
  declaredSize: number;
}

interface RepositoryResult {
  body: Record<string, unknown>;
  profile: RepositoryProfile;
}

interface ContentResponse {
  type: string;
  size: number;
}

interface Semver {
  major: number;
  minor: number;
  patch: number;
  pre: string[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..');
const CACHE_PATH = resolve(PROJECT_ROOT, 'src/data/project-data.cache.json');
const PUBLIC_DIRECTORY = resolve(PROJECT_ROOT, 'public');
const ASSET_DIRECTORY = resolve(PUBLIC_DIRECTORY, PROJECT_ASSET_DIRECTORY);
const LOCAL_REPOSITORY_ROOT = process.env.PROJECT_REPOSITORY_ROOT
  ? resolve(process.env.PROJECT_REPOSITORY_ROOT)
  : null;
const SUMMARY_PATH = process.env.GITHUB_STEP_SUMMARY;
const GITHUB_API = 'https://api.github.com';
const GITHUB_RAW = 'https://raw.githubusercontent.com';
const GITHUB_API_VERSION = '2022-11-28';
const GIT_SHA_PATTERN = /^[0-9a-f]{40,64}$/;
const GITHUB_ORIGIN_PATTERNS = Object.freeze([
  /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/,
  /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/,
  /^ssh:\/\/git@github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/,
]);
const MS_PER_DAY = 86_400_000;
const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function resolveGitHubToken(
  githubToken: string | undefined,
  ghToken: string | undefined,
  readCliToken: () => string | undefined
): string | undefined {
  const environmentToken = githubToken?.trim() || ghToken?.trim();
  if (environmentToken) return environmentToken;
  return readCliToken()?.trim() || undefined;
}

function readGitHubCliToken(): string | undefined {
  const result = spawnSync('gh', ['auth', 'token', '--hostname', 'github.com'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0 || typeof result.stdout !== 'string') return undefined;
  return result.stdout.trim() || undefined;
}

let tokenResolved = false;
let resolvedToken: string | undefined;

function githubToken(): string | undefined {
  if (!tokenResolved) {
    resolvedToken = resolveGitHubToken(
      process.env.GITHUB_TOKEN,
      process.env.GH_TOKEN,
      readGitHubCliToken
    );
    tokenResolved = true;
  }
  return resolvedToken;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function resolveMeta(input: ResolveInput): ResolveOutput {
  const { key, fresh, cache, now } = input;
  if (fresh.ok && fresh.value !== undefined) {
    return {
      value: fresh.value,
      cacheUpdate: { value: fresh.value, fetchedAt: now.toISOString() },
    };
  }
  if (!cache) return { error: `No cache entry for ${key} and fresh fetch failed` };
  const cacheTime = new Date(cache.fetchedAt).getTime();
  const ageDays = Number.isFinite(cacheTime)
    ? Math.max(0, Math.floor((now.getTime() - cacheTime) / MS_PER_DAY))
    : 0;
  return {
    value: cache.value,
    warning: `Fell back to cache for ${key} (last fetched ${ageDays} day${ageDays === 1 ? '' : 's'} ago)`,
  };
}

export function parseSemver(tag: string): Semver | null {
  const match = SEMVER_RE.exec(tag.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] ? match[4].split('.') : [],
  };
}

export function compareSemver(a: Semver, b: Semver): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.pre.length === 0 && b.pre.length > 0) return 1;
  if (a.pre.length > 0 && b.pre.length === 0) return -1;
  for (let index = 0; index < Math.min(a.pre.length, b.pre.length); index++) {
    const left = a.pre[index];
    const right = b.pre[index];
    if (left === right) continue;
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) return Number(left) - Number(right);
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    return left < right ? -1 : 1;
  }
  return a.pre.length - b.pre.length;
}

export function pickLatestTag(tags: string[]): string {
  if (tags.length === 0) throw new Error('no tags returned');
  const parsed = tags
    .map((name) => ({ name, semver: parseSemver(name) }))
    .filter((tag): tag is { name: string; semver: Semver } => tag.semver !== null);
  if (parsed.length === 0) throw new Error(`no semver-shaped tag among: ${tags.join(', ')}`);
  return parsed.reduce((best, tag) => (
    compareSemver(tag.semver, best.semver) > 0 ? tag : best
  )).name;
}

export function parsePushedAt(body: unknown): string {
  if (!isRecord(body) || typeof body.pushed_at !== 'string') {
    throw new Error('repo response missing string pushed_at');
  }
  const date = body.pushed_at.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`pushed_at is not an ISO date: ${body.pushed_at}`);
  }
  return date;
}

export function parseReleaseTag(body: unknown): string {
  if (!isRecord(body) || typeof body.tag_name !== 'string' || body.tag_name.trim() === '') {
    throw new Error('release response missing non-empty tag_name');
  }
  return body.tag_name;
}

export function parseTagNames(body: unknown): string[] {
  if (!Array.isArray(body)) throw new Error('tags response is not an array');
  return body.map((tag) => {
    if (!isRecord(tag) || typeof tag.name !== 'string') {
      throw new Error('tag entry missing string name');
    }
    return tag.name;
  });
}

export function parseRepositoryProfile(repository: string, body: unknown): RepositoryProfile {
  assertListedRepository(repository, body);
  if (!isRecord(body)) throw new Error(`Cannot read ${repository}: repository response is not an object`);
  const owner = body.owner;
  if (body.full_name !== repository) {
    throw new Error(`Cannot read ${repository}: repository response has a different full_name`);
  }
  if (typeof body.name !== 'string' || body.name.trim() === '') {
    throw new Error(`Cannot read ${repository}: repository response missing name`);
  }
  if (!isRecord(owner) || typeof owner.login !== 'string' || owner.login.trim() === '') {
    throw new Error(`Cannot read ${repository}: repository response missing owner login`);
  }
  if (body.description !== null && typeof body.description !== 'string') {
    throw new Error(`Cannot read ${repository}: repository response has invalid description`);
  }
  if (typeof body.html_url !== 'string' || body.html_url !== `https://github.com/${repository}`) {
    throw new Error(`Cannot read ${repository}: repository response has an unexpected URL`);
  }
  return {
    name: body.name,
    owner: owner.login,
    description: body.description && body.description.trim() !== '' ? body.description : null,
    url: body.html_url,
    defaultBranch: body.default_branch as string,
  };
}

export function parseCommitRevision(value: unknown): string {
  if (!isRecord(value) || typeof value.sha !== 'string' || !GIT_SHA_PATTERN.test(value.sha)) {
    throw new Error('commit response missing a supported Git revision');
  }
  return value.sha;
}

export function normalizeGitHubOrigin(value: string): string | null {
  const origin = value.trim();
  for (const pattern of GITHUB_ORIGIN_PATTERNS) {
    const match = pattern.exec(origin);
    if (match) return match[1];
  }
  return null;
}

export function classifyRow(input: ClassifyInput): SummaryRow {
  const base = { repo: input.repo, source: input.source };
  if (input.result.value === undefined) return { ...base, status: 'error' };
  if (!input.result.cacheUpdate) {
    return { ...base, value: input.result.value, status: 'cache' };
  }
  return { ...base, value: input.result.value, status: 'fresh' };
}

export function staticRow(input: { repo: string; value: string }): SummaryRow {
  return { repo: input.repo, source: 'static', value: input.value };
}

const STATUS_LABEL: Record<RowStatus, string> = Object.freeze({
  fresh: 'fresh',
  cache: 'from cache (fetch failed)',
  error: 'ERROR (no value)',
});

export function renderSummary(rows: SummaryRow[]): string {
  const display = (value: string | undefined): string => value || '-';
  const lines = [
    '## Project data',
    '',
    '| Project | Source | Value | Status |',
    '| --- | --- | --- | --- |',
  ];
  for (const row of rows) {
    lines.push(`| ${row.repo} | ${row.source} | ${display(row.value)} | ${row.status ? STATUS_LABEL[row.status] : '-'} |`);
  }
  const counts: Record<RowStatus, number> = { fresh: 0, cache: 0, error: 0 };
  for (const row of rows) {
    if (row.status) counts[row.status]++;
  }
  const staticCount = rows.filter((row) => row.source === PROJECT_META_SOURCE.STATIC).length;
  const parts: string[] = [];
  if (counts.fresh > 0) parts.push(`${counts.fresh} fresh`);
  if (counts.cache > 0) parts.push(`${counts.cache} from cache`);
  if (counts.error > 0) parts.push(`${counts.error} error`);
  if (staticCount > 0) parts.push(`${staticCount} static`);
  lines.push('', `**${rows.length} project(s):** ${parts.length > 0 ? parts.join(', ') : 'none'}.`);
  return lines.join('\n');
}

function githubHeaders(): Record<string, string> {
  const token = githubToken();
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function ghFetch(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: githubHeaders() });
  if (!response.ok) {
    const hint = response.status === 403 && !githubToken()
      ? '; authenticate with gh or set GITHUB_TOKEN or GH_TOKEN'
      : '';
    throw new Error(`GitHub ${url} returned ${response.status}${hint}`);
  }
  return response.json();
}

async function fetchVerifiedRepository(repository: string): Promise<RepositoryResult> {
  let body: unknown;
  try {
    body = await ghFetch(`${GITHUB_API}/repos/${repository}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot verify ${repository} is public: ${detail}`);
  }
  return {
    body: body as Record<string, unknown>,
    profile: parseRepositoryProfile(repository, body),
  };
}

async function fetchReleaseTag(repository: string): Promise<string> {
  return parseReleaseTag(await ghFetch(`${GITHUB_API}/repos/${repository}/releases/latest`));
}

async function fetchLatestTag(repository: string): Promise<string> {
  return pickLatestTag(parseTagNames(await ghFetch(`${GITHUB_API}/repos/${repository}/tags?per_page=100`)));
}

function encodeRepositoryPath(repositoryPath: string): string {
  return repositoryPath.split('/').map(encodeURIComponent).join('/');
}

function parseContentFile(value: unknown, label: string): ContentResponse {
  if (!isRecord(value) || value.type !== 'file' || !Number.isSafeInteger(value.size) || Number(value.size) <= 0) {
    throw new Error(`${label} must be a nonempty regular file`);
  }
  if (Number(value.size) > PROJECT_SCREENSHOT_MAX_BYTES) {
    throw new Error(`${label} exceeds the screenshot size limit`);
  }
  return { type: 'file', size: Number(value.size) };
}

async function fetchRemoteProject(repository: string, defaultBranch: string): Promise<ProjectSource> {
  const commit = await ghFetch(
    `${GITHUB_API}/repos/${repository}/commits/${encodeURIComponent(defaultBranch)}`
  );
  const revision = parseCommitRevision(commit);
  const coverPath = encodeRepositoryPath(PROJECT_COVER_PATH);
  const content = parseContentFile(
    await ghFetch(`${GITHUB_API}/repos/${repository}/contents/${coverPath}?ref=${revision}`),
    `${repository}/${PROJECT_COVER_PATH}`
  );
  const token = githubToken();
  const response = await fetch(
    `${GITHUB_RAW}/${repository}/${revision}/${coverPath}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
  if (!response.ok) throw new Error(`${repository}/${PROJECT_COVER_PATH} returned ${response.status}`);
  return {
    revision,
    cover: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get('content-type'),
    declaredSize: content.size,
  };
}

function gitResult(
  checkout: string,
  argumentsList: string[],
  options: { encoding?: BufferEncoding | null; maxBuffer?: number } = {}
) {
  const result = spawnSync('git', ['-C', checkout, ...argumentsList], {
    encoding: options.encoding === undefined ? 'utf8' : options.encoding,
    maxBuffer: options.maxBuffer,
  });
  if (result.status !== 0) {
    const detail = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    throw new Error(`git ${argumentsList[0]} failed in ${checkout}${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

function gitText(checkout: string, ...argumentsList: string[]): string {
  return String(gitResult(checkout, argumentsList).stdout).trim();
}

function gitBlob(checkout: string, revision: string, repositoryPath: string): Uint8Array {
  const entry = gitText(checkout, 'ls-tree', revision, '--', repositoryPath);
  const tab = entry.indexOf('\t');
  if (tab < 0 || entry.slice(tab + 1) !== repositoryPath) {
    throw new Error(`${repositoryPath} is not tracked at ${revision}`);
  }
  const [mode, type, objectId] = entry.slice(0, tab).split(' ');
  if ((mode !== '100644' && mode !== '100755') || type !== 'blob' || !objectId) {
    throw new Error(`${repositoryPath} must be a regular tracked file`);
  }
  const size = Number(gitText(checkout, 'cat-file', '-s', objectId));
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error(`${repositoryPath} has an invalid Git object size`);
  }
  if (size > PROJECT_SCREENSHOT_MAX_BYTES) {
    throw new Error(`${repositoryPath} exceeds the screenshot size limit`);
  }
  const result = gitResult(checkout, ['cat-file', 'blob', objectId], {
    encoding: null,
    maxBuffer: PROJECT_SCREENSHOT_MAX_BYTES + 1,
  });
  const bytes = new Uint8Array(result.stdout as Buffer);
  if (bytes.length !== size) throw new Error(`${repositoryPath} changed during Git object read`);
  return bytes;
}

async function fetchLocalProject(repository: string): Promise<ProjectSource> {
  if (!LOCAL_REPOSITORY_ROOT) throw new Error('local repository root is not configured');
  const checkout = join(LOCAL_REPOSITORY_ROOT, repository.split('/')[1]);
  const origin = normalizeGitHubOrigin(gitText(checkout, 'remote', 'get-url', 'origin'));
  if (origin !== repository) throw new Error(`${checkout} origin does not match ${repository}`);
  const revision = gitText(checkout, 'rev-parse', 'HEAD');
  if (!GIT_SHA_PATTERN.test(revision)) {
    throw new Error(`${checkout} HEAD is not a supported Git revision`);
  }
  const cover = gitBlob(checkout, revision, PROJECT_COVER_PATH);
  return { revision, cover, contentType: null, declaredSize: cover.length };
}

async function fetchMetadata(
  repository: string,
  meta: ProjectMetaSource,
  repositoryBody: Record<string, unknown>
): Promise<{ ok: true; value: string } | { ok: false }> {
  if (meta.source === PROJECT_META_SOURCE.STATIC) return { ok: true, value: meta.value };
  try {
    let value: string;
    switch (meta.source) {
      case PROJECT_META_SOURCE.PUSHED:
        value = parsePushedAt(repositoryBody);
        break;
      case PROJECT_META_SOURCE.RELEASE:
        value = await fetchReleaseTag(repository);
        break;
      case PROJECT_META_SOURCE.TAG:
        value = await fetchLatestTag(repository);
        break;
    }
    return { ok: true, value };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`metadata fetch failed for ${repository}: ${detail}`);
    return { ok: false };
  }
}

async function emitSummary(summary: string): Promise<void> {
  if (SUMMARY_PATH) await fs.appendFile(SUMMARY_PATH, `${summary}\n`);
}

async function readCache(): Promise<Record<string, CacheEntry>> {
  try {
    const parsed = JSON.parse(await fs.readFile(CACHE_PATH, 'utf8')) as unknown;
    if (!isRecord(parsed)) throw new Error(`${CACHE_PATH} must contain a JSON object`);
    return parsed as Record<string, CacheEntry>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

async function writeProjectAsset(
  stageDirectory: string,
  repository: string,
  source: ProjectSource
): Promise<{ width: number; height: number }> {
  const dimensions = assertProjectCoverImage(source.cover, {
    declaredSize: source.declaredSize,
    contentType: source.contentType,
  });
  const publicPath = projectCoverAssetPath(repository);
  const relativePath = publicPath.slice(PROJECT_ASSET_DIRECTORY.length + 1);
  const target = resolve(stageDirectory, relativePath);
  await fs.mkdir(dirname(target), { recursive: true });
  await fs.writeFile(target, source.cover, { flag: 'wx' });
  return dimensions;
}

async function replaceGeneratedAssets(stageDirectory: string): Promise<void> {
  await fs.rm(ASSET_DIRECTORY, { recursive: true, force: true });
  await fs.rename(stageDirectory, ASSET_DIRECTORY);
}

async function writeCache(cache: ProjectCache): Promise<void> {
  const temporaryPath = `${CACHE_PATH}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(cache, null, 2)}\n`, { flag: 'wx' });
    await fs.rename(temporaryPath, CACHE_PATH);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

async function main(): Promise<void> {
  const cache = await readCache();
  const now = new Date();
  const errors: string[] = [];
  const rows: SummaryRow[] = [];
  const nextCache: ProjectCache = {};
  const stageDirectory = await fs.mkdtemp(resolve(PUBLIC_DIRECTORY, '.project-assets-stage-'));
  let stageMoved = false;
  try {
    for (const listing of projectListings) {
      const repository = listing.repository;
      try {
        assertProjectRepository(repository);
        const repositoryResult = await fetchVerifiedRepository(repository);
        const source = LOCAL_REPOSITORY_ROOT
          ? await fetchLocalProject(repository)
          : await fetchRemoteProject(repository, repositoryResult.profile.defaultBranch);
        let value: string;
        let fetchedAt: string;
        if (listing.meta.source === PROJECT_META_SOURCE.STATIC) {
          value = listing.meta.value;
          fetchedAt = cache[repository]?.fetchedAt ?? now.toISOString();
          rows.push(staticRow({ repo: repository, value }));
        } else {
          const result = resolveMeta({
            key: repository,
            fresh: await fetchMetadata(repository, listing.meta, repositoryResult.body),
            cache: cache[repository],
            now,
          });
          rows.push(classifyRow({ repo: repository, source: listing.meta.source, result }));
          if (result.warning) {
            console.log(`::warning file=scripts/fetch-projects.ts::${result.warning}`);
          }
          if (result.error || result.value === undefined) {
            throw new Error(result.error ?? 'metadata value is missing');
          }
          value = result.value;
          fetchedAt = result.cacheUpdate?.fetchedAt ?? cache[repository]?.fetchedAt ?? now.toISOString();
        }
        const coverDimensions = await writeProjectAsset(stageDirectory, repository, source);
        nextCache[repository] = {
          value,
          fetchedAt,
          name: repositoryResult.profile.name,
          owner: repositoryResult.profile.owner,
          description: repositoryResult.profile.description,
          url: repositoryResult.profile.url,
          coverWidth: coverDimensions.width,
          coverHeight: coverDimensions.height,
        };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        errors.push(`${repository}: ${detail}`);
      }
    }
    if (errors.length > 0) throw new Error(`project data checks failed\n${errors.join('\n')}`);
    await replaceGeneratedAssets(stageDirectory);
    stageMoved = true;
    await writeCache(nextCache);
    await emitSummary(renderSummary(rows));
  } finally {
    if (!stageMoved) await fs.rm(stageDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error('fetch-projects failed:', error);
    process.exit(1);
  });
}
