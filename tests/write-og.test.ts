import { describe, expect, it } from 'vitest';
import { buildOgSvg, escapeXml } from '../scripts/write-og';

describe('escapeXml', () => {
  it('escapes the five XML-significant characters', () => {
    expect(escapeXml('a & b < c > d "e"')).toBe('a &amp; b &lt; c &gt; d &quot;e&quot;');
  });

  it('leaves ordinary copy untouched', () => {
    expect(escapeXml('Finds the workaround. Ships the tool.')).toBe(
      'Finds the workaround. Ships the tool.'
    );
  });
});

describe('buildOgSvg', () => {
  const svg = buildOgSvg({
    host: 'example.dev',
    wordmark: 'A Name',
    tagline: 'A tagline.',
  });

  it('declares the OpenGraph canonical dimensions', () => {
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="630"');
  });

  it('includes every piece of copy', () => {
    expect(svg).toContain('example.dev');
    expect(svg).toContain('A Name');
    expect(svg).toContain('A tagline.');
  });

  it('escapes copy that would break the SVG', () => {
    const nasty = buildOgSvg({
      host: 'example.dev',
      wordmark: 'A & B',
      tagline: '<script>',
    });
    expect(nasty).toContain('A &amp; B');
    expect(nasty).toContain('&lt;script&gt;');
    expect(nasty).not.toContain('<script>');
  });
});
