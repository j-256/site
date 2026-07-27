// Checks that project rows wrap instead of scrolling, at every viewport width a
// phone is likely to report. Scoped to .projects: the symlink list has its own
// wrapping rules, and .skip-link is deliberately clipped to 1px by the
// visually-hidden pattern, so a page-wide scrollWidth sweep flags both forever
import { chromium } from 'playwright';

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:4321';

const WIDTHS = [320, 360, 375, 384, 390, 393, 412, 414, 445, 448, 600, 900];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 414, height: 900 } });
const page = await context.newPage();
let failures = 0;

for (const width of WIDTHS) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(SITE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const result = await page.evaluate(() => {
    const de = document.documentElement;
    const overflowing = [...document.querySelectorAll('.projects, .projects *')]
      .filter(el => el.scrollWidth - el.clientWidth > 1)
      .map(el => el.tagName.toLowerCase() + '.' + el.className);
    const splitNames = [...document.querySelectorAll('.name')]
      .filter(el => el.getClientRects().length > 1)
      .map(el => el.textContent);
    return {
      pageScrolls: de.scrollWidth > de.clientWidth + 1,
      overflowing,
      splitNames,
    };
  });
  const ok = !result.pageScrolls && result.overflowing.length === 0 && result.splitNames.length === 0;
  if (!ok) failures++;
  console.log(
    `${String(width).padStart(4)}px  ${ok ? 'PASS' : 'FAIL'}` +
      (result.pageScrolls ? '  page-h-scroll' : '') +
      (result.overflowing.length ? `  overflow: ${result.overflowing.join(', ')}` : '') +
      (result.splitNames.length ? `  split: ${result.splitNames.join(', ')}` : '')
  );
}
await browser.close();
console.log(failures === 0 ? 'ALL PASS' : `${failures} width(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
