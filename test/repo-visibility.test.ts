import { describe, expect, it } from 'vitest';
import { assertListedRepository, assertPublicRepository } from '../src/lib/repo-visibility';

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

describe('assertListedRepository', () => {
  const publicRepository = {
    visibility: 'public',
    archived: false,
    disabled: false,
    default_branch: 'main',
  };

  it('accepts an active public repository with a default branch', () => {
    expect(() => assertListedRepository('j-256/site', publicRepository)).not.toThrow();
  });

  it('rejects archived repositories', () => {
    expect(() => assertListedRepository('j-256/old', {
      ...publicRepository,
      archived: true,
    })).toThrow(/archived/);
  });

  it('rejects disabled repositories', () => {
    expect(() => assertListedRepository('j-256/disabled', {
      ...publicRepository,
      disabled: true,
    })).toThrow(/disabled/);
  });

  it.each([
    { ...publicRepository, archived: undefined },
    { ...publicRepository, disabled: undefined },
    { ...publicRepository, default_branch: '' },
  ])('rejects incomplete publication metadata', (body) => {
    expect(() => assertListedRepository('j-256/unknown', body)).toThrow(/Cannot/);
  });
});
