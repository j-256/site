const STORAGE_KEY = 'bootSeen';
const TYPE_RATE_MS = 8;
const BANNER_TYPE_RATE_MS = 0.8;

function shouldSkipAnimation(): boolean {
  // ?animate overrides both reduced-motion and the per-session check.
  // Intended for development; real users won't add the flag.
  if (new URLSearchParams(location.search).has('animate')) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
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
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
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

interface LinePrep {
  line: HTMLElement;
  snapshots: TextNodeSnapshot[];
  isBanner: boolean;
}

function prepareLines(boot: HTMLElement): LinePrep[] {
  // Lock each line's natural height as min-height BEFORE emptying its text nodes.
  // Otherwise emptied <pre> banners and prose lines collapse to 0/1 line, the
  // page reflows tighter, and subsequent content jumps when typing fills space
  // back in. Locking heights up front keeps layout stable for the entire animation.
  const lines = Array.from(boot.querySelectorAll<HTMLElement>('[data-boot-line]'));
  const preps: LinePrep[] = [];
  for (const line of lines) {
    const naturalHeight = line.getBoundingClientRect().height;
    line.style.minHeight = `${naturalHeight}px`;
    const isBanner = line.classList.contains('banner');
    const snapshots = snapshotTextNodes(line);
    preps.push({ line, snapshots, isBanner });
  }
  return preps;
}

async function revealLines(preps: LinePrep[], signal: AbortSignal): Promise<void> {
  for (const { line, snapshots, isBanner } of preps) {
    if (signal.aborted) return;
    line.classList.add('typed');
    line.style.visibility = 'visible';
    // Banner uses a faster char rate so the 8-line ASCII art reveals quickly
    // instead of feeling like a multi-second wait. Prose uses the standard rate.
    await typeNodes(snapshots, isBanner ? BANNER_TYPE_RATE_MS : TYPE_RATE_MS, signal);
  }
}

function init(): void {
  const boot = document.querySelector<HTMLElement>('[data-boot]');
  if (!boot) return;

  // The inline <script is:inline> in BootBanner.astro decided whether to start
  // in 'typing' state or render statically. If it chose static, just mark the
  // session and bail.
  if (!boot.classList.contains('typing')) {
    try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch {}
    return;
  }
  if (shouldSkipAnimation()) {
    // Edge case: typing class was set by inline script but reduced-motion
    // changed mid-load. Just clear it.
    boot.classList.remove('typing');
    return;
  }

  const controller = new AbortController();

  // Lock heights and snapshot text nodes BEFORE awaiting anything async, so
  // the inline-script-applied .typing class can hide content while we still
  // have access to the natural heights and original text.
  const preps = prepareLines(boot);

  void (async () => {
    await revealLines(preps, controller.signal);
    // Once typing finishes, the cursor on the prompt line blinks indefinitely.
    // Mark the session so later navigations within it don't re-animate.
    try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch {}
  })();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
