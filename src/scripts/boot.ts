import { animationIsForced, motionShouldReduce } from '../lib/animation-preference';

const STORAGE_KEY = 'bootSeen';
const TYPE_RATE_MS = 8;
const BANNER_TYPE_RATE_MS = 0.8;
// Timer ticks the banner reveal takes, whichever asset is showing. Sized to the
// narrow asset's character count, which set the established pace
const BANNER_TICKS = 190;

function shouldSkipAnimation(): boolean {
  if (animationIsForced()) return false;
  if (motionShouldReduce()) return true;
  try {
    return sessionStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

interface TextNodeSnapshot {
  node: Text;
  full: string;
}

function snapshotTextNodes(root: HTMLElement): TextNodeSnapshot[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest('[data-boot-dynamic]')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  const snapshots: TextNodeSnapshot[] = [];
  let current = walker.nextNode();
  while (current) {
    const text = current as Text;
    snapshots.push({ node: text, full: text.data });
    text.data = '';
    current = walker.nextNode();
  }
  return snapshots;
}

async function typeNodes(snapshots: TextNodeSnapshot[], rateMs: number, signal: AbortSignal): Promise<void> {
  for (const { node, full } of snapshots) {
    for (const ch of full) {
      if (signal.aborted) return;
      node.data += ch;
      await new Promise(r => setTimeout(r, rateMs));
    }
  }
}

function totalChars(snapshots: TextNodeSnapshot[]): number {
  return snapshots.reduce((sum, { full }) => sum + full.length, 0);
}

// Writes the first n characters of a line, spread across its text nodes
function writePrefix(snapshots: TextNodeSnapshot[], n: number): void {
  let remaining = n;
  for (const { node, full } of snapshots) {
    const take = Math.max(0, Math.min(full.length, remaining));
    if (node.data.length !== take) node.data = full.slice(0, take);
    remaining -= take;
  }
}

// Types a set of alternates -- lines where exactly one is displayed per viewport --
// in lockstep off a SINGLE timer chain, advancing every one of them by the same
// fraction of completion on each tick.
//
// This is what makes crossing the breakpoint mid-reveal seamless. Filling the
// hidden alternate instantly instead leaves it complete, so a resize replaces a
// partly-typed banner with a finished one and the animation appears to stop short.
// Lockstep means whichever alternate the viewport reveals is already at the same
// proportional position as the one it replaced.
//
// BANNER_TICKS rather than one tick per character keeps both alternates on the
// same clock despite their differing lengths (352 vs 190 characters); otherwise a
// crossing could land on one that had already finished. Nested setTimeout clamps
// to ~4.4ms per tick regardless of the requested rate, so tick count alone sets
// the duration -- a hidden alternate advancing in larger steps costs nothing
async function typeAlternates(group: LinePrep[], rateMs: number, signal: AbortSignal): Promise<void> {
  const lengths = group.map(prep => totalChars(prep.snapshots));
  for (let tick = 1; tick <= BANNER_TICKS; tick++) {
    if (signal.aborted) return;
    const fraction = tick / BANNER_TICKS;
    for (let i = 0; i < group.length; i++) {
      writePrefix(group[i].snapshots, Math.round(lengths[i] * fraction));
    }
    await new Promise(r => setTimeout(r, rateMs));
  }
}

interface LinePrep {
  line: HTMLElement;
  snapshots: TextNodeSnapshot[];
  isBanner: boolean;
  // Lines sharing a value are alternates: exactly one is displayed per viewport,
  // and they type together so a mid-animation swap is seamless
  altGroup: string | null;
}

function prepareLines(boot: HTMLElement): LinePrep[] {
  // Lock each line's natural height as min-height BEFORE emptying its text nodes.
  // Otherwise emptied <pre> banners and prose lines collapse to 0/1 line, the
  // page reflows tighter, and subsequent content jumps when typing fills space
  // back in. Locking heights up front keeps layout stable for the entire animation
  const lines = Array.from(boot.querySelectorAll<HTMLElement>('[data-boot-line]'));
  const preps: LinePrep[] = [];
  for (const line of lines) {
    const naturalHeight = line.getBoundingClientRect().height;
    line.style.minHeight = `${naturalHeight}px`;
    const isBanner = line.classList.contains('banner');
    const snapshots = snapshotTextNodes(line);
    preps.push({ line, snapshots, isBanner, altGroup: line.dataset.bootAlt ?? null });
  }
  return preps;
}

// Consecutive alternates collapse into one step so they type in lockstep. Runs of
// alternates are kept in DOM order, so the prompt line still follows the banner
function groupAlternates(preps: LinePrep[]): LinePrep[][] {
  const steps: LinePrep[][] = [];
  for (const prep of preps) {
    const last = steps[steps.length - 1];
    if (prep.altGroup !== null && last && last[0].altGroup === prep.altGroup) {
      last.push(prep);
    } else {
      steps.push([prep]);
    }
  }
  return steps;
}

async function revealLines(preps: LinePrep[], signal: AbortSignal): Promise<void> {
  for (const step of groupAlternates(preps)) {
    if (signal.aborted) return;
    for (const { line } of step) {
      line.classList.add('typed');
      line.style.visibility = 'visible';
    }
    // Banner uses a faster char rate so the 8-line ASCII art reveals quickly
    // instead of feeling like a multi-second wait. Prose uses the standard rate
    const rate = step[0].isBanner ? BANNER_TYPE_RATE_MS : TYPE_RATE_MS;
    if (step.length > 1) {
      await typeAlternates(step, rate, signal);
    } else {
      await typeNodes(step[0].snapshots, rate, signal);
    }
  }
}

function init(): void {
  const boot = document.querySelector<HTMLElement>('[data-boot]');
  if (!boot) return;

  // The inline <script is:inline> in BootBanner.astro decided whether to start
  // in 'typing' state or render statically. If it chose static, just mark the
  // session and bail
  if (!boot.classList.contains('typing')) {
    try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch {}
    return;
  }
  if (shouldSkipAnimation()) {
    // Edge case: typing class was set by inline script but reduced-motion
    // changed mid-load. Just clear it
    boot.classList.remove('typing');
    return;
  }

  const controller = new AbortController();

  // Lock heights and snapshot text nodes BEFORE awaiting anything async, so
  // the inline-script-applied .typing class can hide content while we still
  // have access to the natural heights and original text
  const preps = prepareLines(boot);

  void (async () => {
    await revealLines(preps, controller.signal);
    // Once typing finishes, the cursor on the prompt line blinks indefinitely.
    // Mark the session so later navigations within it don't re-animate
    try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch {}
  })();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
