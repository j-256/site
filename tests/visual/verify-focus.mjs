// Checks that every row link is keyboard-reachable, draws a visible focus
// outline, keeps its 44px tap target, and does not land under the sticky header
//
// Two passes, because they catch different things. Tabbing forward scrolls a row
// up from the bottom of the viewport, where the sticky header cannot reach it,
// so the header-overlap check only bites going backward: Shift+Tab parks the
// focused row at the top, and without scroll-margin-top the header covers it
//
// Reached counts are compared against the DOM total so a run that tabs into
// only the first row cannot pass. Text is asserted non-empty for the same
// reason the outline is: a row emptied by the boot animation would satisfy the
// geometry checks while showing nothing, so reducedMotion skips that animation
import { chromium } from 'playwright';

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:4321';
const MIN_OUTLINE_PX = 2;
const MIN_TAP_TARGET_PX = 44;
const ROW_SELECTOR = '.row-link';
// The reached-vs-total check below derives both sides from ROW_SELECTOR, so a
// selector matching nothing compares 0 to 0 and passes. One row per entry in
// src/data/projects.ts plus one per entry in src/data/links.ts
const EXPECTED_ROWS = 15;
const FOCUSABLE_SELECTOR = 'a[href], button, [tabindex]:not([tabindex="-1"])';

function readFocusedRow() {
  const el = document.activeElement;
  if (!el || !el.classList.contains('row-link')) return null;
  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const header = document.querySelector('.hostbar');
  const hb = header ? header.getBoundingClientRect() : null;
  return {
    text: (el.textContent || '').trim(),
    outlineWidth: parseFloat(style.outlineWidth),
    outlineStyle: style.outlineStyle,
    height: Math.round(rect.height),
    overlap: hb ? Math.round(Math.min(rect.bottom, hb.bottom) - Math.max(rect.top, hb.top)) : 0,
  };
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 414, height: 700 },
  reducedMotion: 'reduce',
});
let failures = 0;

async function sweep({ label, key, prime }) {
  const page = await context.newPage();
  await page.goto(SITE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const total = await page.evaluate(sel => document.querySelectorAll(sel).length, ROW_SELECTOR);
  if (prime) await prime(page);

  console.log(`-- ${label} --`);
  if (total !== EXPECTED_ROWS) {
    failures++;
    console.log(
      `FAIL  SELECTOR-MATCHED  ${ROW_SELECTOR}=${total} (expected ${EXPECTED_ROWS})`
    );
  }
  let checked = 0;
  const maxPresses = total * 4 + 20;
  for (let i = 0; i < maxPresses && checked < total; i++) {
    await page.keyboard.press(key);
    const info = await page.evaluate(readFocusedRow);
    if (!info) continue;
    checked++;
    const ok =
      info.text.length > 0 &&
      info.outlineWidth >= MIN_OUTLINE_PX &&
      info.outlineStyle !== 'none' &&
      info.height >= MIN_TAP_TARGET_PX &&
      info.overlap <= 0;
    if (!ok) failures++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  h=${info.height}px  outline=${info.outlineWidth}px ` +
        `${info.outlineStyle}  chars=${info.text.length}` +
        (info.overlap > 0 ? `  UNDER-HEADER-BY-${info.overlap}px` : '') +
        `  ${info.text.slice(0, 30)}`
    );
  }
  if (checked !== total) {
    failures++;
    console.log(`FAIL  reached only ${checked} of ${total} row links`);
  } else {
    console.log(`${checked}/${total} row links reached`);
  }
  await page.close();
}

await sweep({ label: 'Tab forward', key: 'Tab' });
await sweep({
  label: 'Shift+Tab backward',
  key: 'Shift+Tab',
  // Walk to the end of the tab order first, so stepping back parks each row at
  // the top of the viewport, under where the sticky header sits
  prime: async page => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(200);
    const focusable = await page.evaluate(
      sel => document.querySelectorAll(sel).length,
      FOCUSABLE_SELECTOR
    );
    for (let i = 0; i < focusable + 2; i++) await page.keyboard.press('Tab');
  },
});

await browser.close();
console.log(failures === 0 ? 'ALL PASS' : `${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
