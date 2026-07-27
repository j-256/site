// Checks that exactly one banner renders per viewport, that it fits without
// scrolling, and that it scales only below 388px
//
// NATURAL_EPSILON_PX is far below the smallest real scaling step. min() clamps
// to exactly 1em at natural size, so the gap is either 0 or, at 387px (the last
// scaled width), 0.009px. Comparing the unrounded font size keeps that 0.009px
// signal, which a 2-decimal rounding would erase
import { chromium } from 'playwright';

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:4321';
const NATURAL_EPSILON_PX = 0.001;

const CASES = [
  { width: 320, tier: 'narrow', scaled: true },
  { width: 360, tier: 'narrow', scaled: true },
  { width: 375, tier: 'narrow', scaled: true },
  { width: 387, tier: 'narrow', scaled: true },
  { width: 388, tier: 'narrow', scaled: false },
  { width: 390, tier: 'narrow', scaled: false },
  { width: 412, tier: 'narrow', scaled: false },
  { width: 414, tier: 'narrow', scaled: false },
  { width: 444, tier: 'narrow', scaled: false },
  { width: 445, tier: 'wide', scaled: false },
  { width: 600, tier: 'wide', scaled: false },
  { width: 900, tier: 'wide', scaled: false },
];
const browser = await chromium.launch();
// reducedMotion skips the typing animation, which empties every banner's text
// nodes and refills them one at a time. The wide banner types first, so without
// this the narrow banner is still empty when measured and its overflow check
// passes against no text at all
const context = await browser.newContext({
  viewport: { width: 414, height: 700 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
let failures = 0;

for (const { width, tier, scaled } of CASES) {
  await page.setViewportSize({ width, height: 700 });
  await page.goto(SITE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const result = await page.evaluate(async () => {
    await document.fonts.ready;
    const wide = document.querySelector('.banner-wide');
    const narrow = document.querySelector('.banner-narrow');
    const visible = el => getComputedStyle(el).display !== 'none';
    const shown = visible(wide) ? wide : visible(narrow) ? narrow : null;
    return {
      tier: visible(wide) ? 'wide' : visible(narrow) ? 'narrow' : 'NONE',
      bothVisible: visible(wide) && visible(narrow),
      cols: shown ? Math.max(...shown.textContent.split('\n').map(l => l.length)) : 0,
      fontPx: shown ? parseFloat(getComputedStyle(shown).fontSize) : null,
      overflow: shown ? Math.round(shown.scrollWidth - shown.clientWidth) : null,
      rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
    };
  });
  // A null fontPx means no banner is visible at all, which is the bug this
  // harness exists to catch. Report it as a FAIL rather than crashing, so the
  // remaining widths still get checked
  const isScaled = result.fontPx !== null && result.fontPx < result.rootPx - NATURAL_EPSILON_PX;
  // The column count guards the overflow assertion: an emptied banner reports
  // zero overflow no matter how badly it would have fit
  const expectedCols = tier === 'wide' ? 43 : 37;
  const ok =
    result.tier === tier &&
    !result.bothVisible &&
    result.cols === expectedCols &&
    result.overflow === 0 &&
    isScaled === scaled;
  if (!ok) failures++;
  console.log(
    `${String(width).padStart(4)}px  ${ok ? 'PASS' : 'FAIL'}  tier=${result.tier}` +
      `  font=${result.fontPx === null ? 'none' : +result.fontPx.toFixed(3) + 'px'}` +
      `  cols=${result.cols}  scaled=${isScaled}  overflow=${result.overflow}` +
      (result.bothVisible ? '  BOTH-VISIBLE' : '') +
      (result.cols !== expectedCols ? `  EXPECTED-COLS=${expectedCols}` : '')
  );
}
await browser.close();
console.log(failures === 0 ? 'ALL PASS' : `${failures} case(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
