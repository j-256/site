// Checks that symlink targets break only at path separators, never inside a
// hostname or slug, and that the arrow never separates from its target. Scoped
// to .links: the project rows have their own wrapping rules, and .skip-link is
// deliberately clipped to 1px by the visually-hidden pattern, so a page-wide
// scrollWidth sweep flags both forever
import { chromium } from 'playwright';

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:4321';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 360, height: 700 } });
const page = await context.newPage();
let failures = 0;

for (const width of [320, 360, 375, 390, 412, 414, 600]) {
  await page.setViewportSize({ width, height: 700 });
  await page.goto(SITE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const result = await page.evaluate(() => {
    // Reconstruct real visual lines: group each character by its rect top
    const readLines = row => {
      const lines = new Map();
      const walk = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walk.nextNode())) {
        for (let i = 0; i < node.data.length; i++) {
          const range = document.createRange();
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          const rect = range.getBoundingClientRect();
          if (!rect.width && !rect.height) continue;
          const key = Math.round(rect.top);
          lines.set(key, (lines.get(key) ?? '') + node.data[i]);
        }
      }
      return [...lines.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
    };
    return [...document.querySelectorAll('.links .row-link')].map(row => ({
      lines: readLines(row),
      overflow: Math.round(row.scrollWidth - row.clientWidth),
      arrowSplit: row.querySelector('.arrow').getClientRects().length > 1,
    }));
  });
  for (const row of result) {
    // A line ending in '-' means a hyphen break inside the URL
    const hyphenBreak = row.lines.slice(0, -1).some(l => l.trimEnd().endsWith('-'));
    const ok = row.overflow === 0 && !row.arrowSplit && !hyphenBreak;
    if (!ok) failures++;
    console.log(`${String(width).padStart(4)}px  ${ok ? 'PASS' : 'FAIL'}`);
    if (!ok) row.lines.forEach(l => console.log(`        | ${l}`));
  }
}
await browser.close();
console.log(failures === 0 ? 'ALL PASS' : `${failures} row(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
