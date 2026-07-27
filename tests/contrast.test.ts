import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contrastRatio } from '../src/lib/contrast';

const AA = 4.5;
const AAA = 7;

function tokenValue(css: string, token: string): string {
  const match = css.match(new RegExp(`${token}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!match) throw new Error(`token ${token} not found in global.css`);
  return match[1];
}

const css = readFileSync(resolve(__dirname, '../src/styles/global.css'), 'utf-8');
const BG = tokenValue(css, '--bg');

describe('contrastRatio', () => {
  it('returns 21 for black against white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('returns 1 for a color against itself', () => {
    expect(contrastRatio('#26C916', '#26C916')).toBeCloseTo(1, 5);
  });

  it('is order independent', () => {
    expect(contrastRatio('#000000', '#26C916')).toBeCloseTo(
      contrastRatio('#26C916', '#000000'),
      5
    );
  });
});

describe('palette contrast against --bg', () => {
  for (const token of ['--fg', '--fg-dim', '--fg-bright']) {
    it(`${token} meets WCAG AAA (${AAA}:1)`, () => {
      const ratio = contrastRatio(tokenValue(css, token), BG);
      expect(ratio).toBeGreaterThanOrEqual(AAA);
    });
  }

  it('--fg-dim stays visibly dimmer than --fg', () => {
    const dim = contrastRatio(tokenValue(css, '--fg-dim'), BG);
    const fg = contrastRatio(tokenValue(css, '--fg'), BG);
    expect(dim).toBeLessThan(fg);
  });

  it('--fg-bright is the brightest token', () => {
    const bright = contrastRatio(tokenValue(css, '--fg-bright'), BG);
    const fg = contrastRatio(tokenValue(css, '--fg'), BG);
    expect(bright).toBeGreaterThan(fg);
  });

  it('selection colors meet AA against each other', () => {
    const ratio = contrastRatio(
      tokenValue(css, '--selection-bg'),
      tokenValue(css, '--selection-fg')
    );
    expect(ratio).toBeGreaterThanOrEqual(AA);
  });
});
