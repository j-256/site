// Checks that a horizontal touch drag cannot displace the page
//
// This defect is invisible to script. The compositor allows elastic overscroll
// (rubber-banding) even when there is no horizontal scroll range at all, and that
// displacement never reaches scrollLeft, scrollX, or visualViewport.offsetLeft --
// every one of those reads 0 while the page is visibly pulled 14px sideways. So
// the only instrument that works is a screenshot taken WHILE the touch is held.
//
// Two traps this harness exists to avoid:
//
//   1. Comparing PNG bytes instead of pixels. Compressed frames can differ in
//      length, which reads as "completely different" no matter what happened, and
//      a byte-comparing version of this check silently reported the same constant
//      for every case. Frames are decoded to greyscale and compared per pixel.
//
//   2. Sampling after touchEnd. That is exactly when the spring-back completes,
//      so the page is back at rest and the measurement reports success on a page
//      that really did move.
//
// Displacement is measured by cross-correlating rows to find the horizontal shift
// that best aligns the dragged frame with the resting one, so a failure says how
// far the page moved rather than merely that something changed.
//
// PNG decoding is done here with zlib rather than an image library. sharp is
// present in node_modules only as an astro transitive dependency, so importing it
// would break on any astro upgrade that drops or bumps it, and the decode needed
// is small: Chromium screenshots are a single non-interlaced truecolour IDAT
import { chromium } from 'playwright';
import { inflateSync } from 'node:zlib';

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:4321';
// Below this the best-fit search is picking up antialiasing noise, not motion.
// Baseline rubber-banding measured 14-15px, so there is a wide margin here
const MAX_SHIFT_PX = 2;
// A blank page cannot be seen to move, so a frame with no text would pass this
// harness vacuously. The real page renders well over a thousand characters
const MIN_INK_CHARS = 500;
const DRAG_PX = 150;
const DRAG_STEP_PX = 25;
const SEARCH_PX = 60;

const CASES = [
  { width: 360, height: 800 },
  { width: 390, height: 800 },
  { width: 412, height: 800 },
];

const browser = await chromium.launch();
const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: CASES[0] });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

// Minimal PNG reader for Chromium screenshots: walks the chunk list, concatenates
// IDAT, inflates, then undoes the per-scanline filter. Bails loudly on anything it
// does not handle rather than returning plausible garbage that would silently
// weaken the comparison
function decodeGreyscale(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8;
  let header = null;
  const idat = [];
  while (pos < buffer.length) {
    const len = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const body = buffer.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  if (!header) throw new Error('PNG has no IHDR');
  if (header.depth !== 8 || header.interlace !== 0 || (header.colorType !== 2 && header.colorType !== 6)) {
    throw new Error(`unsupported PNG: depth=${header.depth} colorType=${header.colorType} interlace=${header.interlace}`);
  }

  const { width, height } = header;
  const channels = header.colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(width * height);
  const line = Buffer.alloc(stride);
  const prev = Buffer.alloc(stride);

  let offset = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[offset++];
    raw.copy(line, 0, offset, offset + stride);
    offset += stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? line[i - channels] : 0;
      const up = prev[i];
      const upLeft = i >= channels ? prev[i - channels] : 0;
      switch (filter) {
        case 0: break;
        case 1: line[i] = (line[i] + left) & 0xff; break;
        case 2: line[i] = (line[i] + up) & 0xff; break;
        case 3: line[i] = (line[i] + ((left + up) >> 1)) & 0xff; break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          const pred = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          line[i] = (line[i] + pred) & 0xff;
          break;
        }
        default: throw new Error(`unknown PNG filter ${filter} on row ${y}`);
      }
    }
    for (let x = 0; x < width; x++) {
      const i = x * channels;
      // Rec. 601 luma, integer-weighted to keep this allocation-free
      out[y * width + x] = (line[i] * 77 + line[i + 1] * 150 + line[i + 2] * 29) >> 8;
    }
    line.copy(prev);
  }
  return { data: out, width, height };
}

// The horizontal shift that best aligns b onto a. Samples every 3rd row and
// every 2nd column: enough signal for a 2px threshold, and keeps the search cheap
function bestShiftPx(a, b) {
  if (a.width !== b.width || a.height !== b.height) throw new Error('frame size mismatch');
  let best = { shift: 0, err: Infinity };
  for (let shift = -SEARCH_PX; shift <= SEARCH_PX; shift++) {
    let err = 0;
    let samples = 0;
    for (let y = 0; y < a.height; y += 3) {
      for (let x = SEARCH_PX; x < a.width - SEARCH_PX; x += 2) {
        err += Math.abs(a.data[y * a.width + x] - b.data[y * b.width + x + shift]);
        samples++;
      }
    }
    err /= samples;
    if (err < best.err) best = { shift, err };
  }
  return Math.abs(best.shift);
}

// Returns how far the page moved, in pixels, during a held leftward drag.
//
// Both paths inject a stylesheet and differ only in the property under test.
// Injecting only on the control path would compare "page with an injected
// stylesheet" against "page without one" rather than isolating overscroll
// behaviour. The assertion path deliberately injects an inert custom property
// instead of overscroll-behavior-x: none, because supplying that value here would
// mask a regression where the shipped CSS lost the declaration
const INERT_CSS = 'html { --overscroll-probe: 1; }';
const CONTROL_CSS = 'html { overscroll-behavior-x: auto; }';

async function measureDrag({ width, height }, extraCss = INERT_CSS) {
  await page.setViewportSize({ width, height });
  await page.goto(SITE_URL, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: extraCss });
  await page.waitForTimeout(400);

  const state = await page.evaluate(async () => {
    await document.fonts.ready;
    const de = document.documentElement;
    return {
      cx: Math.round(window.innerWidth / 2),
      cy: Math.round(window.innerHeight / 2),
      overscrollX: getComputedStyle(de).overscrollBehaviorX,
      horizRange: de.scrollWidth - de.clientWidth,
      ink: document.body.innerText.trim().length,
    };
  });

  // Crop below the fold-in animation and above the page bottom, so the compared
  // region is dense prose that shifts visibly when the layer moves
  const clip = { x: 0, y: 120, width, height: 220 };
  const resting = decodeGreyscale(await page.screenshot({ clip }));

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: state.cx, y: state.cy }] });
  for (let dx = DRAG_STEP_PX; dx <= DRAG_PX; dx += DRAG_STEP_PX) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: state.cx - dx, y: state.cy }],
    });
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(150);
  const held = decodeGreyscale(await page.screenshot({ clip }));
  const domSaw = await page.evaluate(() => ({
    scrollX: window.scrollX,
    vvOffsetLeft: window.visualViewport ? Math.round(window.visualViewport.offsetLeft) : null,
  }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(500);

  return { ...state, ...domSaw, shift: bestShiftPx(resting, held) };
}

let failures = 0;
for (const size of CASES) {
  const r = await measureDrag(size);
  const problems = [];
  if (r.shift > MAX_SHIFT_PX) problems.push(`PANNED-${r.shift}px`);
  if (r.ink < MIN_INK_CHARS) problems.push(`TOO-LITTLE-TEXT-${r.ink}`);
  if (r.overscrollX !== 'none') problems.push(`OVERSCROLL-X-${r.overscrollX}`);
  if (r.horizRange > 0) problems.push(`HORIZ-SCROLL-RANGE-${r.horizRange}px`);
  if (problems.length) failures++;
  console.log(
    `${String(size.width).padStart(4)}px  shift=${String(r.shift).padStart(3)}px` +
      ` overscrollX=${r.overscrollX.padEnd(5)} horizRange=${r.horizRange}px ink=${r.ink}` +
      ` (DOM saw scrollX=${r.scrollX} vvOffsetLeft=${r.vvOffsetLeft})  ` +
      (problems.length ? 'FAIL ' + problems.join(' ') : 'PASS')
  );
}

// Self-check: with overscroll-behavior-x back to auto the page MUST pan again.
// Without this, a change that stopped the drag from registering at all -- a
// broken probe, a page that fails to load -- would look like a clean pass
const control = await measureDrag(CASES[1], CONTROL_CSS);
const controlOk = control.shift > MAX_SHIFT_PX;
if (!controlOk) failures++;
console.log(
  `\nself-check: re-enabling overscroll pans by ${control.shift}px  ` +
    (controlOk ? 'PASS (this harness can still detect a pan)' : 'FAIL VACUOUS -- no pan even with overscroll enabled')
);

// Suppressing the pan must not cost selection: people copy the URLs and the
// install one-liner off this page, so that is a shipped feature. touch-action:
// pan-y would also stop the pan but interferes with gestures, which is why
// overscroll-behavior is the chosen mechanism -- this guards that choice
//
// Selection is driven by caretRangeFromPoint plus a word expansion, the same
// machinery a long-press handler drives. A dispatched touch hold does not raise
// the native selection UI headlessly, so testing the literal gesture would assert
// nothing
const COPY_WANTS = ['James Klein', 'toolio.sh', 'github.com/j-256'];
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(SITE_URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const selection = await page.evaluate(() => {
  const body = document.querySelector('.section .body');
  const rect = body.getBoundingClientRect();
  const x = Math.round(rect.left + 60);
  const y = Math.round(rect.top + 8);
  // caretPositionFromPoint is the standard API. No fallback to the deprecated
  // caretRangeFromPoint: Playwright pins its own Chromium, so there is no older
  // engine to accommodate, and both were verified to resolve to the same word
  let range = null;
  const position = document.caretPositionFromPoint?.(x, y);
  if (position) {
    range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
  }
  const sel = window.getSelection();
  let word = '';
  if (range) {
    sel.removeAllRanges();
    sel.addRange(range);
    sel.modify?.('move', 'backward', 'word');
    sel.modify?.('extend', 'forward', 'word');
    word = sel.toString().trim();
  }
  // Whole-document selection stands in for the ^A that precedes a copy
  const all = document.createRange();
  all.selectNodeContents(document.body);
  sel.removeAllRanges();
  sel.addRange(all);
  return {
    word,
    userSelect: getComputedStyle(body).userSelect,
    allText: sel.toString(),
  };
});
const missing = COPY_WANTS.filter(want => !selection.allText.includes(want));
const selectionOk = selection.word.length > 2 && missing.length === 0 && selection.userSelect !== 'none';
if (!selectionOk) failures++;
console.log(
  `selection: word=${JSON.stringify(selection.word)} userSelect=${selection.userSelect}` +
    ` selectable=${selection.allText.trim().length} chars  ` +
    (selectionOk ? 'PASS' : `FAIL ${missing.length ? 'MISSING ' + missing.join(', ') : 'WORD-SELECT-BROKEN'}`)
);

await browser.close();
if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('ALL PASS');
