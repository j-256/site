import { describe, expect, it } from 'vitest';

import {
  PROJECT_COVER_PATH,
  assertProjectCoverImage,
  assertProjectRepository,
  projectCoverAssetPath,
} from '../src/lib/project-assets';

function png(width = 1280, height = 720): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe('assertProjectCoverImage', () => {
  it('accepts a bounded PNG and returns its dimensions', () => {
    const bytes = png();
    expect(assertProjectCoverImage(bytes, {
      declaredSize: bytes.length,
      contentType: 'image/png',
    })).toEqual({ width: 1280, height: 720 });
  });

  it('rejects empty, malformed, changing, and mistyped content', () => {
    const bytes = png();
    expect(() => assertProjectCoverImage(new Uint8Array())).toThrow(/empty/);
    expect(() => assertProjectCoverImage(Uint8Array.from([1, 2, 3]))).toThrow(/PNG/);
    expect(() => assertProjectCoverImage(bytes, { declaredSize: bytes.length + 1 })).toThrow(/changed/);
    expect(() => assertProjectCoverImage(bytes, { contentType: 'text/plain' })).toThrow(/content type/);
  });

  it('rejects zero dimensions', () => {
    expect(() => assertProjectCoverImage(png(0, 720))).toThrow(/dimensions/);
  });
});

describe('project repository assets', () => {
  it('uses one conventional cover path and a deterministic public path', () => {
    expect(PROJECT_COVER_PATH).toBe('docs/screenshots/cover.png');
    expect(projectCoverAssetPath('j-256/example')).toBe(
      'project-assets/j-256/example/cover.png'
    );
  });

  it('rejects invalid repository identities', () => {
    expect(() => assertProjectRepository('../example')).toThrow(/repository/);
    expect(() => projectCoverAssetPath('j-256/example/extra')).toThrow(/repository/);
  });
});
