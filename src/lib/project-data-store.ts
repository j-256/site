import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface ProjectDataEntry {
  value: string;
  fetchedAt: string;
  name: string;
  owner: string;
  description: string | null;
  url: string;
  coverWidth: number;
  coverHeight: number;
  coverSha256: string;
}

export type ProjectData = Record<string, ProjectDataEntry>;

export const PROJECT_DATA_FILE = Object.freeze({
  RUNTIME: 'src/data/project-data.runtime.json',
  SNAPSHOT: 'src/data/project-data.cache.json',
} as const);

export const PROJECT_DATA_SOURCE = Object.freeze({
  EMPTY: 'empty',
  RUNTIME: 'runtime',
  SNAPSHOT: 'snapshot',
} as const);

export type ProjectDataSource = (typeof PROJECT_DATA_SOURCE)[keyof typeof PROJECT_DATA_SOURCE];

export interface LoadedProjectData {
  data: ProjectData;
  source: ProjectDataSource;
}

export interface WriteProjectDataOptions {
  updateSnapshot?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function projectDataPaths(projectRoot: string): { runtime: string; snapshot: string } {
  return {
    runtime: resolve(projectRoot, PROJECT_DATA_FILE.RUNTIME),
    snapshot: resolve(projectRoot, PROJECT_DATA_FILE.SNAPSHOT),
  };
}

export async function readProjectDataFile(path: string): Promise<ProjectData | null> {
  let contents: string;
  try {
    contents = await fs.readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }

  const parsed = JSON.parse(contents) as unknown;
  if (!isRecord(parsed)) throw new Error(`${path} must contain a JSON object`);
  return parsed as ProjectData;
}

export async function loadProjectData(projectRoot: string): Promise<LoadedProjectData> {
  const paths = projectDataPaths(projectRoot);
  const runtime = await readProjectDataFile(paths.runtime);
  if (runtime) return { data: runtime, source: PROJECT_DATA_SOURCE.RUNTIME };

  const snapshot = await readProjectDataFile(paths.snapshot);
  if (snapshot) return { data: snapshot, source: PROJECT_DATA_SOURCE.SNAPSHOT };

  return { data: {}, source: PROJECT_DATA_SOURCE.EMPTY };
}

export async function writeProjectDataFile(path: string, data: ProjectData): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
    await fs.rename(temporaryPath, path);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

export async function writeProjectData(
  projectRoot: string,
  data: ProjectData,
  options: WriteProjectDataOptions = {}
): Promise<void> {
  const paths = projectDataPaths(projectRoot);
  await writeProjectDataFile(paths.runtime, data);
  if (options.updateSnapshot) await writeProjectDataFile(paths.snapshot, data);
}
