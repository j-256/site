import { createHash } from 'node:crypto';

import type { ProjectData } from './project-data-store';

export const PROJECT_RELEASE_MANIFEST_VERSION = 1;

export interface ProjectReleaseEntry {
  value: string;
  description: string | null;
  coverSha256: string;
}

export interface ProjectReleaseManifest {
  version: typeof PROJECT_RELEASE_MANIFEST_VERSION;
  projects: Record<string, ProjectReleaseEntry>;
}

export interface ProjectChangeBaselineEntry {
  value?: string;
  description?: string | null;
  coverSha256?: string;
}

export type ProjectChangeBaseline = Record<string, ProjectChangeBaselineEntry>;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function projectCoverSha256(cover: Uint8Array): string {
  return createHash('sha256').update(cover).digest('hex');
}

export function projectChangeBaselineFromData(data: ProjectData): ProjectChangeBaseline {
  return Object.fromEntries(Object.entries(data).map(([repository, entry]) => [
    repository,
    {
      value: entry.value,
      description: entry.description,
      coverSha256: entry.coverSha256,
    },
  ]));
}

export function createProjectReleaseManifest(data: ProjectData): ProjectReleaseManifest {
  return {
    version: PROJECT_RELEASE_MANIFEST_VERSION,
    projects: Object.fromEntries(Object.entries(data).map(([repository, entry]) => [
      repository,
      {
        value: entry.value,
        description: entry.description,
        coverSha256: entry.coverSha256,
      },
    ])),
  };
}

export function parseProjectReleaseManifest(value: unknown): ProjectReleaseManifest {
  if (!isRecord(value) || value.version !== PROJECT_RELEASE_MANIFEST_VERSION) {
    throw new Error('project release manifest has an unsupported version');
  }
  if (!isRecord(value.projects)) {
    throw new Error('project release manifest is missing its projects object');
  }

  const projects: Record<string, ProjectReleaseEntry> = {};
  for (const [repository, entry] of Object.entries(value.projects)) {
    if (!isRecord(entry) || typeof entry.value !== 'string' || entry.value.trim() === '') {
      throw new Error(`project release manifest has an invalid value for ${repository}`);
    }
    if (entry.description !== null && typeof entry.description !== 'string') {
      throw new Error(`project release manifest has an invalid description for ${repository}`);
    }
    if (typeof entry.coverSha256 !== 'string' || !SHA256_PATTERN.test(entry.coverSha256)) {
      throw new Error(`project release manifest has an invalid cover digest for ${repository}`);
    }
    projects[repository] = {
      value: entry.value,
      description: entry.description,
      coverSha256: entry.coverSha256,
    };
  }

  return { version: PROJECT_RELEASE_MANIFEST_VERSION, projects };
}

export function updateProjectReleaseCover(
  manifest: ProjectReleaseManifest,
  repository: string,
  cover: Uint8Array
): ProjectReleaseManifest {
  const entry = manifest.projects[repository];
  if (!entry) throw new Error(`project release manifest is missing ${repository}`);
  return {
    ...manifest,
    projects: {
      ...manifest.projects,
      [repository]: {
        ...entry,
        coverSha256: projectCoverSha256(cover),
      },
    },
  };
}
