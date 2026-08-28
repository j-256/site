import { describe, expect, it } from 'vitest';
import { DESCRIPTION, WORDMARK, TAGLINE } from '../src/data/site';

describe('site identity', () => {
  it('exports a non-empty wordmark', () => {
    expect(WORDMARK.trim()).not.toBe('');
  });

  it('exports a non-empty tagline', () => {
    expect(TAGLINE.trim()).not.toBe('');
  });

  it('exports a non-empty description', () => {
    expect(DESCRIPTION.trim()).not.toBe('');
  });

  it('uses no em-dash or curly quotes in site copy', () => {
    // Unicode escapes, not literal glyphs: the repo bans these characters in
    // source, so a test asserting their absence cannot contain them either
    const banned = /[\u2014\u2018\u2019\u201C\u201D]/;
    for (const value of [WORDMARK, TAGLINE, DESCRIPTION]) {
      expect(value).not.toMatch(banned);
    }
  });
});
