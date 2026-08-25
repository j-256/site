import { PROJECT_ARTIFACT, type ProjectArtifact } from '../data/projects';

export function projectPermissions(artifact: ProjectArtifact): string {
  return artifact === PROJECT_ARTIFACT.RUNNABLE ? '-rwxr-xr-x' : 'drwxr-xr-x';
}
