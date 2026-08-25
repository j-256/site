export const PROJECT_ARTIFACT = Object.freeze({
  RUNNABLE: 'runnable',
  BUNDLE: 'bundle',
} as const);

export type ProjectArtifact = (typeof PROJECT_ARTIFACT)[keyof typeof PROJECT_ARTIFACT];

export const PROJECT_META_SOURCE = Object.freeze({
  PUSHED: 'pushed',
  RELEASE: 'release',
  TAG: 'tag',
  STATIC: 'static',
} as const);

export type ProjectMetaSource =
  | { source: typeof PROJECT_META_SOURCE.PUSHED }
  | { source: typeof PROJECT_META_SOURCE.RELEASE }
  | { source: typeof PROJECT_META_SOURCE.TAG }
  | { source: typeof PROJECT_META_SOURCE.STATIC; value: string };

export interface ProjectListing {
  repository: string;
  artifact: ProjectArtifact;
  meta: ProjectMetaSource;
}

export const projectListings: readonly ProjectListing[] = Object.freeze([
  { repository: 'j-256/stowplan', artifact: PROJECT_ARTIFACT.BUNDLE, meta: { source: PROJECT_META_SOURCE.RELEASE } },
  { repository: 'j-256/hookrelay', artifact: PROJECT_ARTIFACT.BUNDLE, meta: { source: PROJECT_META_SOURCE.RELEASE } },
  { repository: 'j-256/d1-r2-starter-factory', artifact: PROJECT_ARTIFACT.BUNDLE, meta: { source: PROJECT_META_SOURCE.PUSHED } },
  { repository: 'j-256/reorg', artifact: PROJECT_ARTIFACT.RUNNABLE, meta: { source: PROJECT_META_SOURCE.RELEASE } },
  { repository: 'j-256/ccam', artifact: PROJECT_ARTIFACT.RUNNABLE, meta: { source: PROJECT_META_SOURCE.RELEASE } },
  { repository: 'j-256/agent-skills', artifact: PROJECT_ARTIFACT.BUNDLE, meta: { source: PROJECT_META_SOURCE.RELEASE } },
  { repository: 'j-256/stream-eval', artifact: PROJECT_ARTIFACT.RUNNABLE, meta: { source: PROJECT_META_SOURCE.RELEASE } },
  { repository: 'j-256/site', artifact: PROJECT_ARTIFACT.BUNDLE, meta: { source: PROJECT_META_SOURCE.PUSHED } },
  { repository: 'j-256/qlomni', artifact: PROJECT_ARTIFACT.BUNDLE, meta: { source: PROJECT_META_SOURCE.RELEASE } },
  { repository: 'j-256/git-crypt-vscode', artifact: PROJECT_ARTIFACT.BUNDLE, meta: { source: PROJECT_META_SOURCE.RELEASE } },
  { repository: 'j-256/persistent-clicker', artifact: PROJECT_ARTIFACT.BUNDLE, meta: { source: PROJECT_META_SOURCE.PUSHED } },
  { repository: 'j-256/bm_keyvalidator', artifact: PROJECT_ARTIFACT.BUNDLE, meta: { source: PROJECT_META_SOURCE.STATIC, value: 'stable' } },
  { repository: 'j-256/sh', artifact: PROJECT_ARTIFACT.RUNNABLE, meta: { source: PROJECT_META_SOURCE.PUSHED } },
  { repository: 'j-256/p12-generator', artifact: PROJECT_ARTIFACT.RUNNABLE, meta: { source: PROJECT_META_SOURCE.PUSHED } },
  { repository: 'j-256/rover-dumper', artifact: PROJECT_ARTIFACT.RUNNABLE, meta: { source: PROJECT_META_SOURCE.TAG } },
]);

export const projectRepositories = Object.freeze(
  projectListings.map((project) => project.repository)
);
