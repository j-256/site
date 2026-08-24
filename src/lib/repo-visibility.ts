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
