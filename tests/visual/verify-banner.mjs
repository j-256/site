// Checks that exactly one banner renders per viewport, that it fits without
// scrolling, and that it scales only below 389px
//
// NATURAL_EPSILON_PX is far below the smallest real scaling step. min() clamps
// to exactly 1em at natural size, so the gap is either 0 or, at 388px (the last
// scaled width), 0.036px. Comparing the unrounded font size keeps that signal,
// which a 2-decimal rounding would erase
//
// Fit is measured against the banner's REAL rendered text width via Range, not
// scrollWidth. scrollWidth is an integer, so it reported a clean 0 overflow
// while the text was genuinely 0.4-1.2px wider than its box and the element had
// become its own horizontal scroll container. Sub-pixel overflow is the whole
// defect class here, so the assertion has to see sub-pixel values
import { chromium } from 'playwright';

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:4321';
const NATURAL_EPSILON_PX = 0.001;
// The text must fit inside its box, not merely round to a fit
const MAX_TEXT_EXCESS_PX = 0;

const CASES = [
  { width: 320, tier: 'narrow', scaled: true },
  { width: 360, tier: 'narrow', scaled: true },
  { width: 375, tier: 'narrow', scaled: true },
  { width: 388, tier: 'narrow', scaled: true },
  { width: 389, tier: 'narrow', scaled: false },
  { width: 390, tier: 'narrow', scaled: false },
  { width: 412, tier: 'narrow', scaled: false },
  { width: 414, tier: 'narrow', scaled: false },
  { width: 446, tier: 'narrow', scaled: false },
  { width: 447, tier: 'wide', scaled: false },
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
    // Real rendered width of the widest text row, at the element's own computed
    // font size. Range reports sub-pixel values; scrollWidth rounds them away
    let textExcess = null;
    let scrollable = null;
    if (shown) {
      const range = document.createRange();
      let textWidth = 0;
      for (const node of [...shown.childNodes].filter(n => n.nodeType === Node.TEXT_NODE)) {
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) textWidth = Math.max(textWidth, rect.width);
      }
      textExcess = textWidth - shown.getBoundingClientRect().width;
      // Whether the element can actually be panned, which is what a user sees
      // as a scrollbar. Independent of the sub-pixel measurement above
      shown.scrollLeft = 9999;
      scrollable = shown.scrollLeft;
      shown.scrollLeft = 0;
    }
    return {
      tier: visible(wide) ? 'wide' : visible(narrow) ? 'narrow' : 'NONE',
      bothVisible: visible(wide) && visible(narrow),
      cols: shown ? Math.max(...shown.textContent.split('\n').map(l => l.length)) : 0,
      fontPx: shown ? parseFloat(getComputedStyle(shown).fontSize) : null,
      overflow: shown ? Math.round(shown.scrollWidth - shown.clientWidth) : null,
      textExcess,
      scrollable,
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
  const fits = result.textExcess !== null && result.textExcess <= MAX_TEXT_EXCESS_PX;
  const pans = result.scrollable !== null && result.scrollable > 0;
  const ok =
    result.tier === tier &&
    !result.bothVisible &&
    result.cols === expectedCols &&
    result.overflow === 0 &&
    fits &&
    !pans &&
    isScaled === scaled;
  if (!ok) failures++;
  console.log(
    `${String(width).padStart(4)}px  ${ok ? 'PASS' : 'FAIL'}  tier=${result.tier}` +
      `  font=${result.fontPx === null ? 'none' : +result.fontPx.toFixed(3) + 'px'}` +
      `  cols=${result.cols}  scaled=${isScaled}  overflow=${result.overflow}` +
      `  textExcess=${result.textExcess === null ? 'none' : +result.textExcess.toFixed(3) + 'px'}` +
      (result.bothVisible ? '  BOTH-VISIBLE' : '') +
      (result.cols !== expectedCols ? `  EXPECTED-COLS=${expectedCols}` : '') +
      (fits ? '' : '  TEXT-WIDER-THAN-BOX') +
      (pans ? `  PANNABLE-BY-${result.scrollable}px` : '')
  );
}
await browser.close();
console.log(failures === 0 ? 'ALL PASS' : `${failures} case(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
