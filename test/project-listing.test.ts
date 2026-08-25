import { describe, expect, it } from 'vitest';

import {
  PROJECT_ARTIFACT,
  PROJECT_META_SOURCE,
  projectListings,
  projectRepositories,
} from '../src/data/projects';
import { projectPermissions } from '../src/lib/project-listing';

describe('project listings', () => {
  it('keeps the ordered repository list unique', () => {
    expect(projectListings.length).toBeGreaterThan(0);
    expect(projectRepositories).toEqual(projectListings.map((project) => project.repository));
    expect(new Set(projectRepositories).size).toBe(projectRepositories.length);
  });

  it('contains only site-owned presentation choices', () => {
    for (const listing of projectListings) {
      expect(Object.keys(listing).sort()).toEqual(['artifact', 'meta', 'repository']);
      expect(listing.repository).toMatch(/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/);
      expect(Object.values(PROJECT_ARTIFACT)).toContain(listing.artifact);
      expect(Object.values(PROJECT_META_SOURCE)).toContain(listing.meta.source);
    }
  });

  it('maps artifact shape to the terminal listing mode', () => {
    expect(projectPermissions(PROJECT_ARTIFACT.RUNNABLE)).toBe('-rwxr-xr-x');
    expect(projectPermissions(PROJECT_ARTIFACT.BUNDLE)).toBe('drwxr-xr-x');
  });
});
