export const PUBLIC_REPOSITORY_VISIBILITY = 'public';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function assertPublicRepository(repo: string, body: unknown): void {
  if (!isRecord(body) || typeof body.visibility !== 'string') {
    throw new Error(`Cannot verify ${repo} is public: repository response missing string visibility`);
  }
  if (body.visibility !== PUBLIC_REPOSITORY_VISIBILITY) {
    throw new Error(`Refusing to publish ${repo}: repository visibility is ${body.visibility}`);
  }
}

export function assertListedRepository(repo: string, body: unknown): void {
  assertPublicRepository(repo, body);
  if (!isRecord(body) || typeof body.archived !== 'boolean') {
    throw new Error(`Cannot verify ${repo} is active: repository response missing boolean archived`);
  }
  if (body.archived) throw new Error(`Refusing to list ${repo}: repository is archived`);
  if (typeof body.disabled !== 'boolean') {
    throw new Error(`Cannot verify ${repo} is active: repository response missing boolean disabled`);
  }
  if (body.disabled) throw new Error(`Refusing to list ${repo}: repository is disabled`);
  if (typeof body.default_branch !== 'string' || body.default_branch.trim() === '') {
    throw new Error(`Cannot resolve ${repo}: repository response missing default_branch`);
  }
}
