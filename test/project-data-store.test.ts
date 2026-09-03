import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  PROJECT_DATA_SOURCE,
  loadProjectData,
  projectDataPaths,
  writeProjectData,
  writeProjectDataFile,
  type ProjectData,
} from '../src/lib/project-data-store';

const temporaryRoots: string[] = [];

function projectData(value: string): ProjectData {
  return {
    'j-256/site': {
      value,
      fetchedAt: '2026-08-27T12:00:00.000Z',
      name: 'site',
      owner: 'j-256',
      description: 'Source for jklein.dev',
      url: 'https://github.com/j-256/site',
      coverWidth: 1440,
      coverHeight: 1000,
      coverSha256: 'a'.repeat(64),
    },
  };
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'site-project-data-'));
  temporaryRoots.push(root);
  return root;
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true })));
});

describe('loadProjectData', () => {
  it('loads the committed snapshot when runtime data is absent', async () => {
    const root = await temporaryRoot();
    const paths = projectDataPaths(root);
    const snapshot = projectData('snapshot');
    await writeJson(paths.snapshot, snapshot);

    await expect(loadProjectData(root)).resolves.toEqual({
      data: snapshot,
      source: PROJECT_DATA_SOURCE.SNAPSHOT,
    });
  });

  it('prefers runtime data over the committed snapshot', async () => {
    const root = await temporaryRoot();
    const paths = projectDataPaths(root);
    const snapshot = projectData('snapshot');
    const runtime = projectData('runtime');
    await writeJson(paths.snapshot, snapshot);
    await writeJson(paths.runtime, runtime);

    await expect(loadProjectData(root)).resolves.toEqual({
      data: runtime,
      source: PROJECT_DATA_SOURCE.RUNTIME,
    });
  });

  it('returns an empty source when neither data file exists', async () => {
    const root = await temporaryRoot();
    await expect(loadProjectData(root)).resolves.toEqual({
      data: {},
      source: PROJECT_DATA_SOURCE.EMPTY,
    });
  });

  it('rejects invalid runtime data instead of masking it with the snapshot', async () => {
    const root = await temporaryRoot();
    const paths = projectDataPaths(root);
    await writeJson(paths.snapshot, projectData('snapshot'));
    await writeJson(paths.runtime, []);

    await expect(loadProjectData(root)).rejects.toThrow(/must contain a JSON object/);
  });
});

describe('writeProjectData', () => {
  it('writes routine results only to ignored runtime data', async () => {
    const root = await temporaryRoot();
    const paths = projectDataPaths(root);
    const snapshot = projectData('snapshot');
    const runtime = projectData('runtime');
    await writeProjectDataFile(paths.snapshot, snapshot);
    const originalSnapshot = await readFile(paths.snapshot, 'utf8');

    await writeProjectData(root, runtime);

    expect(JSON.parse(await readFile(paths.runtime, 'utf8'))).toEqual(runtime);
    expect(await readFile(paths.snapshot, 'utf8')).toBe(originalSnapshot);
    expect((await readdir(dirname(paths.runtime))).sort()).toEqual([
      'project-data.cache.json',
      'project-data.runtime.json',
    ]);
  });

  it('promotes explicit refreshes to runtime data and the committed snapshot', async () => {
    const root = await temporaryRoot();
    const paths = projectDataPaths(root);
    const refreshed = projectData('refreshed');

    await writeProjectData(root, refreshed, { updateSnapshot: true });

    expect(JSON.parse(await readFile(paths.runtime, 'utf8'))).toEqual(refreshed);
    expect(JSON.parse(await readFile(paths.snapshot, 'utf8'))).toEqual(refreshed);
  });
});
