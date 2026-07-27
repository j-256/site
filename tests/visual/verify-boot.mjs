// Checks that the typing animation runs once per browsing session: on the first
// load of a session, not on later navigations within it, and again in a fresh
// session. Single-load testing cannot see this bug, so every case below pins a
// visit state as well as a viewport
//
// Each case also asserts WHICH storage the gate wrote, because the animated
// outcomes alone do not distinguish a per-session gate from the 7-day
// localStorage fence this replaced: Playwright starts every context with both
// storages empty, so under an outcome-only harness the old gate produces exactly
// the expected values and passes vacuously
//
// Both waits are on observed state rather than fixed sleeps. boot.ts writes the
// sessionStorage mark only after the whole reveal resolves, so a fixed sleep
// before the second navigation races that write and the second load wrongly
// animates. The banner-stability wait is the same hazard at the other end: the
// module empties every text node and refills them one character at a time, so a
// sleep that lands mid-animation measures a half-typed banner
import { chromium } from 'playwright';

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:4321';
const STEP_MS = 100;
const WAIT_TIMEOUT_MS = 20_000;
// Column counts of the two banner assets, as asserted by verify-banner.mjs
const EXPECTED_COLS = { wide: 43, narrow: 37 };

const browser = await chromium.launch();
let failures = 0;

// Reads the banner that is actually displayed at the current viewport
const SHOWN_BANNER = `() => {
  const wide = document.querySelector('.banner-wide');
  const narrow = document.querySelector('.banner-narrow');
  const shown = getComputedStyle(wide).display !== 'none' ? wide : narrow;
  return shown;
}`;

function readMarks() {
  const read = store => {
    try {
      return store.getItem('bootSeen');
    } catch {
      return null;
    }
  };
  return { session: read(sessionStorage), local: read(localStorage) };
}

// The mark is what suppresses the animation on later loads, so a same-session
// probe has to wait for it before navigating again. It is also the only reliable
// "boot has settled" signal: boot.ts writes it in both branches of init(), and
// after the ENTIRE reveal, which outlasts the shown banner. Waiting on banner
// text alone is not enough -- at wide viewports the shown banner types first and
// stabilizes while the other banner and the prompt line are still filling in
// Returns rather than throws on timeout: a missing mark is a finding to report
// per case, not a reason to abandon the run
async function waitForSessionMark(page) {
  for (let i = 0; i < WAIT_TIMEOUT_MS / STEP_MS; i++) {
    const marks = await page.evaluate(`(${readMarks})()`);
    if (marks.session !== null) return true;
    await page.waitForTimeout(STEP_MS);
  }
  return false;
}

// Settles when the shown banner's character count stops growing, i.e. typing has
// finished (or never started, for a static render)
async function waitForStableBanner(page) {
  let previous = -1;
  for (let i = 0; i < WAIT_TIMEOUT_MS / STEP_MS; i++) {
    const count = await page.evaluate(`(${SHOWN_BANNER})().textContent.length`);
    if (count > 0 && count === previous) return;
    previous = count;
    await page.waitForTimeout(STEP_MS);
  }
}

async function probe({ label, width, reduced, sameSession, query = '', expect }) {
  const context = await browser.newContext({
    viewport: { width, height: 800 },
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  await page.goto(SITE_URL + query, { waitUntil: 'domcontentloaded' });
  // The typing class is applied by the inline pre-hydration script, so read it
  // at load rather than after the animation would have finished
  let animated = await page.evaluate(
    () => document.querySelector('[data-boot]').classList.contains('typing')
  );
  let marked = await waitForSessionMark(page);
  if (sameSession) {
    // A second navigation in the same context keeps sessionStorage; a new
    // context would not
    await page.goto(SITE_URL + query, { waitUntil: 'domcontentloaded' });
    animated = await page.evaluate(
      () => document.querySelector('[data-boot]').classList.contains('typing')
    );
    marked = await waitForSessionMark(page);
  }
  await waitForStableBanner(page);
  // Whether or not it animated, the banner has to end up on screen with its
  // full text. Asserting the column count stops an emptied or half-typed
  // element from passing as "visible"
  const banner = await page.evaluate(`(() => {
    const shown = (${SHOWN_BANNER})();
    const style = getComputedStyle(shown);
    const text = shown.textContent;
    return {
      tier: shown.classList.contains('banner-wide') ? 'wide' : 'narrow',
      displayed: style.display !== 'none' && style.visibility === 'visible',
      cols: Math.max(...text.split('\\n').map(l => l.length)),
      chars: text.trim().length,
    };
  })()`);
  const visible = banner.displayed && banner.chars > 0 && banner.cols === EXPECTED_COLS[banner.tier];
  // Assert which storage the gate uses, not just the resulting animation. A
  // 7-day localStorage fence produces the same animated= values as a
  // sessionStorage gate under Playwright, because a fresh context clears both,
  // so outcome-only assertions pass against either implementation
  const marks = await page.evaluate(`(${readMarks})()`);
  const rightStore = marks.session !== null && marks.local === null;
  const ok = animated === expect && visible && marked && rightStore;
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(44)} animated=${animated} (want ${expect})` +
      `  banner=${banner.tier} cols=${banner.cols} displayed=${banner.displayed}` +
      `  mark=session:${marks.session !== null} local:${marks.local !== null}` +
      (marked ? '' : '  SESSION-MARK-NEVER-WRITTEN') +
      (banner.cols === EXPECTED_COLS[banner.tier] ? '' : `  EXPECTED-COLS=${EXPECTED_COLS[banner.tier]}`)
  );
  await context.close();
}

await probe({ label: 'first load in a session, 414px', width: 414, expect: true });
await probe({ label: 'second load, same session, 414px', width: 414, sameSession: true, expect: false });
await probe({ label: 'first load in a NEW session, 414px', width: 414, expect: true });
await probe({ label: 'first load in a session, 900px', width: 900, expect: true });
await probe({ label: 'prefers-reduced-motion', width: 414, reduced: true, expect: false });
await probe({ label: '?animate overrides reduced-motion', width: 414, reduced: true, query: '?animate', expect: true });
await probe({ label: '?animate overrides same-session', width: 414, sameSession: true, query: '?animate', expect: true });

await browser.close();
console.log(failures === 0 ? 'ALL PASS' : `${failures} case(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
