import { describe, expect, it } from 'vitest';

import {
  disclosedProjectListings,
  initialProjectListings,
  PROJECT_ARTIFACT,
  PROJECT_META_SOURCE,
  projectListings,
  projectRepositories,
} from '../src/data/projects';
import { projectPermissions } from '../src/lib/project-listing';

describe('project listings', () => {
  it('derives the complete order from explicit initial and disclosed inventories', () => {
    expect(initialProjectListings.length).toBeGreaterThan(0);
    expect(disclosedProjectListings.length).toBeGreaterThan(0);
    expect(projectListings).toEqual([
      ...initialProjectListings,
      ...disclosedProjectListings,
    ]);
    expect(projectRepositories).toEqual(projectListings.map((project) => project.repository));
    expect(new Set(projectRepositories).size).toBe(projectRepositories.length);
  });

  it('keeps initial and disclosed inventories disjoint', () => {
    const initialRepositories = new Set(
      initialProjectListings.map((project) => project.repository)
    );
    for (const project of disclosedProjectListings) {
      expect(initialRepositories.has(project.repository)).toBe(false);
    }
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
