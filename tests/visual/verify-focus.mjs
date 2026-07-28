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

// Tab to the skip link (first focusable), activate it, and report where focus
// lands
async function activateSkipLink(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    if (document.activeElement) document.activeElement.blur();
  });
  await page.keyboard.press('Tab');
  const onSkipLink = await page.evaluate(
    () => !!document.activeElement && document.activeElement.classList.contains('skip-link')
  );
  await page.keyboard.press('Enter');
  // Wait for focus to settle on #content. waitForFunction re-evaluates across
  // the same-document hash navigation instead of racing it the way a bare
  // evaluate does; when focus does not move (the regression the self-check
  // forces) it times out and the read below reports the real landing spot
  await page
    .waitForFunction(() => document.activeElement && document.activeElement.id === 'content', null, {
      timeout: 1500,
    })
    .catch(() => {});
  const landed = await page.evaluate(() => {
    const el = document.activeElement;
    return { tag: el ? el.tagName.toLowerCase() : null, id: el ? el.id || null : null };
  });
  return { onSkipLink, landed };
}

// Following the skip link must move focus into the content, not merely scroll
// there. tabindex="-1" on #content lets the browser park focus on the region,
// so a keyboard user's next Tab continues from inside the content rather than
// from the skip link. Assert focus lands on #content after activation, then
// self-check by stripping the tabindex and confirming the same activation no
// longer reaches #content, so this cannot pass vacuously if the target regresses
//
// The skip target must also sit past the decorative boot banner: #content
// begins at the site header, not the ASCII transcript, so following the link
// bypasses the banner rather than landing on it. Assert the banner renders
// outside #content
async function checkSkipLinkFocus() {
  const page = await context.newPage();
  await page.goto(SITE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  console.log('-- Skip link moves focus --');

  const real = await activateSkipLink(page);
  const moved = real.onSkipLink && real.landed.id === 'content';
  if (!moved) failures++;
  console.log(
    `${moved ? 'PASS' : 'FAIL'}  skipLinkFocused=${real.onSkipLink} ` +
      `landed=${real.landed.tag}#${real.landed.id ?? ''}`
  );

  const banner = await page.evaluate(() => {
    const el = document.querySelector('[data-boot]');
    const main = document.querySelector('#content');
    return {
      present: !!el,
      insideContent: !!(el && main && main.contains(el)),
    };
  });
  const bypassesBanner = banner.present && !banner.insideContent;
  if (!bypassesBanner) failures++;
  console.log(
    `${bypassesBanner ? 'PASS' : 'FAIL'}  boot banner present=${banner.present} ` +
      `insideContent=${banner.insideContent} (want present=true insideContent=false)`
  );

  await page.evaluate(() => {
    const main = document.querySelector('#content');
    if (main) main.removeAttribute('tabindex');
  });
  const stripped = await activateSkipLink(page);
  const detects = stripped.landed.id !== 'content';
  if (!detects) failures++;
  console.log(
    `self-check: without tabindex landed=${stripped.landed.tag}#${stripped.landed.id ?? ''}  ` +
      `${detects ? 'PASS (this check can still fail)' : 'FAIL (check is vacuous)'}`
  );

  await page.close();
}

await checkSkipLinkFocus();

await browser.close();
console.log(failures === 0 ? 'ALL PASS' : `${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
