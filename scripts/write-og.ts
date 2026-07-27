import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { siteHost } from '../src/lib/site-host';
import { WORDMARK, TAGLINE } from '../src/data/site';

const HERE = dirname(fileURLToPath(import.meta.url));
const OG_PATH = resolve(HERE, '../public/og.png');
// Build-time TTFs, not the served WOFF2: resvg takes font files by path and does
// not parse WOFF2
const FONT_FILES = [
  resolve(HERE, '../assets/fonts/JetBrainsMono-Bold.ttf'),
  resolve(HERE, '../assets/fonts/JetBrainsMono-Regular.ttf'),
];

const WIDTH = 1200;
const HEIGHT = 630;

const BG = '#000000';
const FG = '#26C916';
const FG_DIM = '#23AD19';
const FG_BRIGHT = '#29FE13';

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface OgCopy {
  host: string;
  wordmark: string;
  tagline: string;
}

// Baselines chosen so the rendered block sits centred vertically, and every
// line is anchored to the horizontal centre. Social platforms crop this frame
// differently, some toward square, so a centred composition survives cropping
// that would clip a flush-left one
const CENTER_X = WIDTH / 2;
const HOST_BASELINE = 194;
const WORDMARK_BASELINE = 328;
const TAGLINE_BASELINE = 405;
const PROMPT_BASELINE = 506;

const HOST_SIZE = 104;
const WORDMARK_SIZE = 48;
const TAGLINE_SIZE = 30;
const PROMPT_SIZE = 30;

// JetBrains Mono advances exactly 0.6em per character, so a line's width is
// arithmetic rather than a measurement
const ADVANCE_RATIO = 0.6;

export function lineWidth(text: string, fontSize: number): number {
  return text.length * fontSize * ADVANCE_RATIO;
}

export function buildOgSvg(copy: OgCopy): string {
  // The prompt is "$ " plus a block cursor drawn as a rect, so it is centred as
  // one unit rather than anchoring the glyph and letting the rect drift
  const promptWidth = lineWidth('$ ', PROMPT_SIZE) + PROMPT_SIZE * ADVANCE_RATIO;
  const promptLeft = CENTER_X - promptWidth / 2;
  const cursorLeft = promptLeft + lineWidth('$ ', PROMPT_SIZE);
  const cursorWidth = Math.round(PROMPT_SIZE * ADVANCE_RATIO);
  const cursorHeight = Math.round(PROMPT_SIZE * 0.86);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BG}"/>
  <text x="${CENTER_X}" y="${HOST_BASELINE}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="${HOST_SIZE}" fill="${FG_BRIGHT}">${escapeXml(copy.host)}</text>
  <text x="${CENTER_X}" y="${WORDMARK_BASELINE}" text-anchor="middle" font-family="JetBrains Mono" font-size="${WORDMARK_SIZE}" fill="${FG}">${escapeXml(copy.wordmark)}</text>
  <text x="${CENTER_X}" y="${TAGLINE_BASELINE}" text-anchor="middle" font-family="JetBrains Mono" font-size="${TAGLINE_SIZE}" fill="${FG_DIM}">${escapeXml(copy.tagline)}</text>
  <text x="${promptLeft}" y="${PROMPT_BASELINE}" font-family="JetBrains Mono" font-weight="700" font-size="${PROMPT_SIZE}" fill="${FG_BRIGHT}">$</text>
  <rect x="${cursorLeft}" y="${PROMPT_BASELINE - cursorHeight}" width="${cursorWidth}" height="${cursorHeight}" fill="${FG_BRIGHT}"/>
</svg>`;
}

// Every line is a single un-wrapped <text>, so copy that outgrows the canvas
// silently runs off the edge. The host is the tightest line because it is the
// largest, and SITE_HOST is deliberately swappable, so check all three
// variable-length lines rather than trusting today's values. The prompt is a
// fixed two characters and cannot overflow
const SIDE_MARGIN = 60;

export function overflowingLines(copy: OgCopy): string[] {
  const usable = WIDTH - SIDE_MARGIN * 2;
  const lines: Array<[string, string, number]> = [
    ['host', copy.host, HOST_SIZE],
    ['wordmark', copy.wordmark, WORDMARK_SIZE],
    ['tagline', copy.tagline, TAGLINE_SIZE],
  ];
  return lines
    .filter(([, text, size]) => lineWidth(text, size) > usable)
    .map(
      ([label, text, size]) =>
        `${label} needs ${Math.ceil(lineWidth(text, size))}px, usable is ${usable}px`
    );
}

async function main(): Promise<void> {
  const host = siteHost();
  const copy: OgCopy = { host, wordmark: WORDMARK, tagline: TAGLINE };
  const overflowing = overflowingLines(copy);
  if (overflowing.length > 0) {
    throw new Error(`copy does not fit the canvas: ${overflowing.join('; ')}`);
  }
  const svg = buildOgSvg(copy);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
    font: {
      fontFiles: FONT_FILES,
      loadSystemFonts: false,
      defaultFontFamily: 'JetBrains Mono',
    },
  });
  const rendered = resvg.render();
  if (rendered.width !== WIDTH || rendered.height !== HEIGHT) {
    throw new Error(
      `expected ${WIDTH}x${HEIGHT}, rendered ${rendered.width}x${rendered.height}`
    );
  }
  await writeFile(OG_PATH, rendered.asPng());
  console.log(`write-og: wrote ${OG_PATH} (${WIDTH}x${HEIGHT}) for ${host}`);
}

// Only run when executed directly, so the test can import the pure helpers
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    await main();
  } catch (err) {
    console.error(`write-og: ${(err as Error).message}`);
    process.exit(1);
  }
}
