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

export function buildOgSvg(copy: OgCopy): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BG}"/>
  <text x="80" y="250" font-family="JetBrains Mono" font-weight="700" font-size="104" fill="${FG_BRIGHT}">${escapeXml(copy.host)}</text>
  <text x="80" y="342" font-family="JetBrains Mono" font-size="48" fill="${FG}">${escapeXml(copy.wordmark)}</text>
  <text x="80" y="420" font-family="JetBrains Mono" font-size="30" fill="${FG_DIM}">${escapeXml(copy.tagline)}</text>
  <text x="80" y="548" font-family="JetBrains Mono" font-weight="700" font-size="30" fill="${FG_BRIGHT}">$</text>
  <rect x="108" y="526" width="18" height="26" fill="${FG_BRIGHT}"/>
</svg>`;
}

async function main(): Promise<void> {
  const host = siteHost();
  const svg = buildOgSvg({ host, wordmark: WORDMARK, tagline: TAGLINE });
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
