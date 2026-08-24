import { describe, expect, it } from 'vitest';
import { assertPublicRepository } from '../src/lib/repo-visibility';

describe('assertPublicRepository', () => {
  it('accepts a public repository', () => {
    expect(() => assertPublicRepository('j-256/site', { visibility: 'public' })).not.toThrow();
  });

  it.each(['private', 'internal'])('rejects %s repositories', (visibility) => {
    expect(() => assertPublicRepository('j-256/hidden', { visibility })).toThrow(
      `Refusing to publish j-256/hidden: repository visibility is ${visibility}`
    );
  });

  it.each([{}, { visibility: null }, null])('rejects unverifiable responses', (body) => {
    expect(() => assertPublicRepository('j-256/unknown', body)).toThrow(
      'Cannot verify j-256/unknown is public'
    );
  });
});
