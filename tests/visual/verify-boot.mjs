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
// Total character counts of the two assets, including newlines. Used as exact
// completion targets: a partially typed banner must not read as finished
const EXPECTED_CHARS = { wide: 352, narrow: 190 };
// Ceiling for "the visible banner starts typing promptly". setTimeout clamps to
// ~4.5ms per character, so animating the hidden banner first pushed the visible
// one's first character past 1.6s at narrow viewports. Generous enough to absorb
// module load and font settling, tight enough that a regression to
// hidden-banner-first (~1600ms) fails
const MAX_FIRST_CHAR_MS = 400;
// Crossing the breakpoint mid-animation must resume the reveal at the same
// proportional position. One tick of forward progress between the two samples is
// expected, so this allows a small forward drift while still failing the old
// behaviour, which jumped the revealed banner straight to 100%
const MAX_HANDOFF_DRIFT = 0.05;
// Both alternates run off a shared tick budget, so their durations should match
// within scheduler noise
const MAX_DURATION_SPREAD_MS = 150;

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

// Measures WHEN the visible banner's first character lands, and whether the
// prompt line follows it rather than racing it. The probe() cases above all wait
// for the animation to finish, so none of them can see a late start
async function probeFirstChar({ label, width, tier }) {
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await context.newPage();
  await page.goto(SITE_URL + '?animate', { waitUntil: 'domcontentloaded' });
  const timing = await page.evaluate(
    `(async ({ target }) => {
      const t0 = performance.now();
      const shown = (${SHOWN_BANNER})();
      const prompt = document.querySelector('.prompt-line');
      let first = null;
      let done = null;
      let promptFirst = null;
      for (let i = 0; i < 9000; i++) {
        const now = performance.now() - t0;
        const len = shown.textContent.length;
        if (first === null && len > 0) first = now;
        if (done === null && len >= target) done = now;
        if (promptFirst === null && prompt.textContent.trim().length > 0) promptFirst = now;
        if (done !== null && promptFirst !== null) break;
        await new Promise(r => requestAnimationFrame(r));
      }
      const round = v => (v === null ? null : Math.round(v));
      return {
        first: round(first),
        done: round(done),
        promptFirst: round(promptFirst),
        chars: shown.textContent.length,
      };
    })({ target: ${EXPECTED_CHARS[tier]} })`
  );
  // Both halves matter. The latency check catches the hidden banner being typed
  // first; the char-count check stops a banner that never filled from passing
  // the latency check vacuously
  const prompt = timing.promptFirst;
  const startedPromptly = timing.first !== null && timing.first <= MAX_FIRST_CHAR_MS;
  const filled = timing.chars === EXPECTED_CHARS[tier];
  // The boot metaphor depends on the banner printing before the prompt returns.
  // Revealing every line concurrently makes the prompt land at 0ms, complete,
  // under a banner that is barely started
  const promptFollows = prompt !== null && timing.done !== null && prompt >= timing.done;
  const ok = startedPromptly && filled && promptFollows;
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(44)} firstChar=${timing.first}ms (max ${MAX_FIRST_CHAR_MS})` +
      `  bannerDone=${timing.done}ms  promptFirstChar=${prompt}ms` +
      `  chars=${timing.chars}/${EXPECTED_CHARS[tier]}` +
      (startedPromptly ? '' : '  LATE-START') +
      (filled ? '' : '  NOT-FULLY-TYPED') +
      (promptFollows ? '' : '  PROMPT-RACED-BANNER')
  );
  await context.close();
}

// Regression guard for the other half of the fix: the hidden banner still has to
// end up unhidden and non-empty, because crossing the breakpoint swaps which one
// has a layout box. Skipping hidden lines outright leaves the newly shown banner
// blank under .boot.typing's visibility rule
//
// resizeAt is a delay in ms before the resize, for crossing the breakpoint while
// the animation is still running. Omit it to resize after the animation settles.
// A mid-animation crossing is only expected to be PARTIALLY typed: it resumes at
// the position the other alternate had reached. Requiring a full character count
// there would encode the old fill-instantly behaviour, which forced the revealed
// banner to 100% and cut the animation short. Column count is still asserted
// exactly, since a wrong-width or half-width asset is a real defect
async function probeMorph({ from, to, tier, resizeAt }) {
  const context = await browser.newContext({ viewport: { width: from, height: 800 } });
  const page = await context.newPage();
  await page.goto(SITE_URL + '?animate', { waitUntil: 'domcontentloaded' });
  let marked = true;
  if (resizeAt === undefined) {
    marked = await waitForSessionMark(page);
    await page.setViewportSize({ width: to, height: 800 });
  } else {
    // Resize mid-animation, then assert the revealed banner is readable
    // IMMEDIATELY rather than whenever the reveal loop happens to reach it
    await page.waitForTimeout(resizeAt);
    await page.setViewportSize({ width: to, height: 800 });
    await page.waitForTimeout(150);
  }
  const banner = await page.evaluate(`(() => {
    const shown = (${SHOWN_BANNER})();
    const style = getComputedStyle(shown);
    const text = shown.textContent;
    return {
      tier: shown.classList.contains('banner-wide') ? 'wide' : 'narrow',
      visibility: style.visibility,
      chars: text.length,
      cols: Math.max(...text.split('\\n').map(l => l.length)),
      rects: shown.getClientRects().length,
    };
  })()`);
  // After the animation settles the banner must be complete. Mid-animation it
  // must merely be non-empty and still growing toward its full length
  // Column count is exact only once settled: mid-animation the newest row is
  // partial, so the widest typed row is narrower than the asset until the first
  // row completes. Bounding it catches a wrong-width asset without making the
  // case depend on exactly how far typing has progressed. verify-banner.mjs
  // asserts the exact column count at every viewport
  const settled = resizeAt === undefined;
  const charsOk = settled
    ? banner.chars === EXPECTED_CHARS[tier]
    : banner.chars > 0 && banner.chars <= EXPECTED_CHARS[tier];
  const colsOk = settled ? banner.cols === EXPECTED_COLS[tier] : banner.cols <= EXPECTED_COLS[tier];
  const ok =
    marked &&
    banner.tier === tier &&
    banner.visibility === 'visible' &&
    charsOk &&
    colsOk &&
    banner.rects > 0;
  if (!ok) failures++;
  const when = settled ? 'after boot' : `at t=${resizeAt}ms`;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${`resize ${from}px -> ${to}px ${when}`.padEnd(44)}` +
      ` shown=${banner.tier} (want ${tier})  visibility=${banner.visibility}` +
      `  chars=${banner.chars}/${EXPECTED_CHARS[tier]}${settled ? '' : ' (partial ok)'}` +
      `  cols=${banner.cols}  rects=${banner.rects}` +
      (marked ? '' : '  SESSION-MARK-NEVER-WRITTEN') +
      (charsOk ? '' : '  CHARS-WRONG') +
      (colsOk ? '' : `  EXPECTED-COLS<=${EXPECTED_COLS[tier]}`)
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

// Crossing the breakpoint must RESUME the animation, not end it. probeMorph only
// asserts the revealed banner ends up filled, which the fill-hidden-instantly
// behaviour also satisfied: it replaced a partly-typed banner with a finished one,
// so the animation visibly stopped short. Comparing completion fraction either
// side of the resize is what distinguishes resuming from jumping
async function probeHandoff({ from, to, tier, resizeAt }) {
  const context = await browser.newContext({ viewport: { width: from, height: 800 } });
  const page = await context.newPage();
  await page.goto(SITE_URL + '?animate', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(resizeAt);
  const read = `(() => {
    const shown = (${SHOWN_BANNER})();
    const t = shown.classList.contains('banner-wide') ? 'wide' : 'narrow';
    const total = ${JSON.stringify(EXPECTED_CHARS)}[t];
    return { tier: t, chars: shown.textContent.length, fraction: shown.textContent.length / total,
             visibility: getComputedStyle(shown).visibility };
  })()`;
  const before = await page.evaluate(read);
  await page.setViewportSize({ width: to, height: 800 });
  const after = await page.evaluate(read);
  const drift = after.fraction - before.fraction;
  // A tick of forward progress is fine; a jump to complete is the defect. Both
  // samples must also be mid-animation, or the case proves nothing
  const midAnimation = before.fraction > 0.05 && before.fraction < 0.95;
  const resumed = Math.abs(drift) <= MAX_HANDOFF_DRIFT && after.fraction < 0.99;
  const ok = midAnimation && resumed && after.tier === tier && after.visibility === 'visible';
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${`handoff ${from}px -> ${to}px at t=${resizeAt}ms`.padEnd(44)}` +
      ` ${before.tier}@${before.fraction.toFixed(3)} -> ${after.tier}@${after.fraction.toFixed(3)}` +
      ` drift=${drift >= 0 ? '+' : ''}${drift.toFixed(3)} (max ${MAX_HANDOFF_DRIFT})` +
      (midAnimation ? '' : '  NOT-MID-ANIMATION') +
      (after.fraction >= 0.99 ? '  JUMPED-TO-COMPLETE' : '') +
      (resumed || after.fraction >= 0.99 ? '' : '  DRIFTED')
  );
  await context.close();
}

// Both alternates must also finish on the same clock. If duration depended on the
// asset's own length, a crossing late in the shorter one's reveal would land on an
// alternate that had already finished -- the same visible defect, just at one end
async function probeSameDuration(widths) {
  const timings = [];
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await context.newPage();
    await page.goto(SITE_URL + '?animate', { waitUntil: 'domcontentloaded' });
    const done = await page.evaluate(`(async () => {
      const t0 = performance.now();
      const shown = (${SHOWN_BANNER})();
      const target = shown.classList.contains('banner-wide') ? ${EXPECTED_CHARS.wide} : ${EXPECTED_CHARS.narrow};
      for (let i = 0; i < 9000; i++) {
        if (shown.textContent.length >= target) return Math.round(performance.now() - t0);
        await new Promise(r => requestAnimationFrame(r));
      }
      return null;
    })()`);
    timings.push({ width, done });
    await context.close();
  }
  const values = timings.map(t => t.done);
  const spread = values.some(v => v === null) ? null : Math.max(...values) - Math.min(...values);
  const ok = spread !== null && spread <= MAX_DURATION_SPREAD_MS;
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${'both banners share one clock'.padEnd(44)}` +
      ` ${timings.map(t => `${t.width}px=${t.done}ms`).join(' ')}` +
      `  spread=${spread}ms (max ${MAX_DURATION_SPREAD_MS})`
  );
}

await probeFirstChar({ label: 'visible banner types first, 360px', width: 360, tier: 'narrow' });
await probeFirstChar({ label: 'visible banner types first, 900px', width: 900, tier: 'wide' });
await probeMorph({ from: 360, to: 900, tier: 'wide' });
await probeMorph({ from: 900, to: 360, tier: 'narrow' });
// Mid-animation crossings: the reveal loop decides per line whether to type or
// fill, so a resize before it reaches a line must not leave that line blank
for (const resizeAt of [100, 800, 1600]) {
  await probeMorph({ from: 900, to: 360, tier: 'narrow', resizeAt });
  await probeMorph({ from: 360, to: 900, tier: 'wide', resizeAt });
}

// Sampled inside the reveal in both directions. Late crossings are covered by
// probeMorph above; these have to land mid-animation to compare positions
for (const resizeAt of [150, 300, 500, 700]) {
  await probeHandoff({ from: 900, to: 360, tier: 'narrow', resizeAt });
  await probeHandoff({ from: 360, to: 900, tier: 'wide', resizeAt });
}
await probeSameDuration([360, 900]);

await browser.close();
console.log(failures === 0 ? 'ALL PASS' : `${failures} case(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
