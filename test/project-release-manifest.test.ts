import { describe, expect, it } from 'vitest';

import type { ProjectData } from '../src/lib/project-data-store';
import {
  PROJECT_RELEASE_MANIFEST_VERSION,
  createProjectReleaseManifest,
  parseProjectReleaseManifest,
  projectChangeBaselineFromData,
  projectCoverSha256,
  updateProjectReleaseCover,
} from '../src/lib/project-release-manifest';

const COVER = new Uint8Array([1, 2, 3, 4]);
const COVER_SHA256 = '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a';

function projectData(): ProjectData {
  return {
    'j-256/site': {
      value: '2026-09-03',
      fetchedAt: '2026-09-03T12:00:00.000Z',
      name: 'site',
      owner: 'j-256',
      description: 'Source for jklein.dev.',
      url: 'https://github.com/j-256/site',
      coverWidth: 1440,
      coverHeight: 1000,
      coverSha256: COVER_SHA256,
    },
  };
}

describe('project release manifest', () => {
  it('hashes cover bytes with SHA-256', () => {
    expect(projectCoverSha256(COVER)).toBe(COVER_SHA256);
  });

  it('keeps only change-detection fields from project data', () => {
    expect(createProjectReleaseManifest(projectData())).toEqual({
      version: PROJECT_RELEASE_MANIFEST_VERSION,
      projects: {
        'j-256/site': {
          value: '2026-09-03',
          description: 'Source for jklein.dev.',
          coverSha256: COVER_SHA256,
        },
      },
    });
    expect(projectChangeBaselineFromData(projectData())).toEqual(
      createProjectReleaseManifest(projectData()).projects
    );
  });

  it('parses a valid manifest and rejects malformed entries', () => {
    const manifest = createProjectReleaseManifest(projectData());
    expect(parseProjectReleaseManifest(manifest)).toEqual(manifest);
    expect(() => parseProjectReleaseManifest({ version: 2, projects: {} })).toThrow(/version/);
    expect(() => parseProjectReleaseManifest({
      version: PROJECT_RELEASE_MANIFEST_VERSION,
      projects: { 'j-256/site': { value: 'x', description: null, coverSha256: 'bad' } },
    })).toThrow(/digest/);
  });

  it('updates one cover digest without changing other release data', () => {
    const manifest = createProjectReleaseManifest(projectData());
    const updated = updateProjectReleaseCover(manifest, 'j-256/site', new Uint8Array([5, 6]));
    expect(updated.projects['j-256/site']).toEqual({
      ...manifest.projects['j-256/site'],
      coverSha256: projectCoverSha256(new Uint8Array([5, 6])),
    });
    expect(manifest.projects['j-256/site'].coverSha256).toBe(COVER_SHA256);
  });

  it('rejects a cover update for a project outside the manifest', () => {
    const manifest = createProjectReleaseManifest(projectData());
    expect(() => updateProjectReleaseCover(manifest, 'j-256/missing', COVER)).toThrow(/missing/);
  });
});
