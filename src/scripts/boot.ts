const STORAGE_KEY = 'bootSeen';
const FRESH_DAYS = 7;
const TYPE_RATE_MS = 6;
const LINE_RATE_MS = 30;

function settled(boot: HTMLElement): void {
  boot.classList.remove('typing');
  boot.classList.add('settled');
  try {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
  } catch { /* localStorage may be unavailable; non-fatal */ }
}

function shouldSkipAnimation(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  try {
    const last = localStorage.getItem(STORAGE_KEY);
    if (!last) return false;
    const ageMs = Date.now() - new Date(last).getTime();
    return ageMs < FRESH_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

async function typeChars(target: HTMLElement, text: string): Promise<void> {
  target.textContent = '';
  for (const ch of text) {
    target.textContent += ch;
    await new Promise(r => setTimeout(r, TYPE_RATE_MS));
  }
}

async function revealLines(boot: HTMLElement, signal: AbortSignal): Promise<void> {
  const lines = Array.from(boot.querySelectorAll<HTMLElement>('[data-boot-line]'));
  for (const line of lines) {
    if (signal.aborted) return;
    line.classList.add('typed');
    if (line.classList.contains('banner')) {
      // banner reveals as a whole block, not char-by-char
      line.style.visibility = 'visible';
      await new Promise(r => setTimeout(r, LINE_RATE_MS));
    } else {
      const original = line.textContent ?? '';
      line.style.visibility = 'visible';
      await typeChars(line, original);
    }
  }
}

async function maybeFetchIp(boot: HTMLElement): Promise<void> {
  const params = new URLSearchParams(location.search);
  if (params.get('from') !== 'ip') return;
  const fromEl = boot.querySelector<HTMLElement>('[data-from]');
  if (!fromEl) return;
  const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 250));
  const fetched = fetch('https://api.ipify.org?format=json')
    .then(r => r.json())
    .then((j: { ip: string }) => j.ip)
    .catch(() => null);
  const ip = await Promise.race([fetched, timeout]);
  if (ip) fromEl.textContent = ip;
}

function init(): void {
  const boot = document.querySelector<HTMLElement>('[data-boot]');
  if (!boot) return;

  const controller = new AbortController();
  const skip = (): void => {
    controller.abort();
    settled(boot);
  };

  if (shouldSkipAnimation()) {
    settled(boot);
    return;
  }

  boot.classList.add('typing');
  ['keydown', 'pointerdown', 'wheel', 'touchstart'].forEach(ev => {
    window.addEventListener(ev, skip, { once: true, passive: true });
  });

  void (async () => {
    await maybeFetchIp(boot);
    await revealLines(boot, controller.signal);
    if (!controller.signal.aborted) settled(boot);
  })();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
