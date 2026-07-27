import { describe, expect, it } from 'vitest';
import { buildOgSvg, escapeXml, lineWidth, overflowingLines } from '../scripts/write-og';

const CURRENT_COPY = {
  host: 'jklein.dev',
  wordmark: 'James Klein',
  tagline: 'Finds the workaround. Ships the tool.',
};

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

  it('centres the three text lines on the canvas', () => {
    const anchored = svg.match(/text-anchor="middle"/g) ?? [];
    expect(anchored).toHaveLength(3);
    expect(svg).toContain('x="600"');
  });

  it('keeps the cursor block adjacent to the prompt glyph', () => {
    const prompt = svg.match(/<text x="([\d.]+)"[^>]*>\$<\/text>/);
    const cursor = svg.match(/<rect x="([\d.]+)" y="[\d.]+" width="(\d+)"/);
    expect(prompt).not.toBeNull();
    expect(cursor).not.toBeNull();
    const promptX = Number(prompt![1]);
    const cursorX = Number(cursor![1]);
    // The cursor sits exactly two character advances right of the prompt, so a
    // future spacing change cannot silently detach them
    expect(cursorX - promptX).toBeCloseTo(2 * 30 * 0.6, 5);
  });
});

describe('lineWidth', () => {
  it('derives width from the 0.6em monospace advance', () => {
    expect(lineWidth('abcde', 100)).toBe(300);
  });

  it('returns zero for empty copy', () => {
    expect(lineWidth('', 104)).toBe(0);
  });
});

describe('overflowingLines', () => {
  it('passes the copy the site actually ships', () => {
    expect(overflowingLines(CURRENT_COPY)).toEqual([]);
  });

  it('catches a hostname too wide for the canvas', () => {
    const found = overflowingLines({ ...CURRENT_COPY, host: 'james-klein.example' });
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('host');
  });

  it('catches a tagline too wide for the canvas', () => {
    const found = overflowingLines({
      ...CURRENT_COPY,
      tagline: 'Finds the workaround, ships the tool, and documents it for whoever comes next.',
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('tagline');
  });

  it('reports every overflowing line, not just the first', () => {
    const found = overflowingLines({
      host: 'an-extremely-long-hostname.example',
      wordmark: 'A Reasonably Long Name That Will Not Fit At All Either',
      tagline: 'And a tagline that is likewise far too long to fit inside the canvas width',
    });
    expect(found).toHaveLength(3);
  });
});
