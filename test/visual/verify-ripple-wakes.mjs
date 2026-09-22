import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:4321';
const VIEWPORT = Object.freeze({ width: 1280, height: 720 });
const browser = await chromium.launch();
const errors = [];

try {
  const page = await browser.newPage({ viewport: VIEWPORT, reducedMotion: 'no-preference' });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => sessionStorage.setItem('bootSeen', '1'));
  await page.goto(new URL('/?animate=1', SITE_URL).href, { waitUntil: 'networkidle' });
  const entrypoint = await page.request.get(new URL('/src/scripts/ripple.ts', SITE_URL).href);
  const speeds = entrypoint.headers()['content-type']?.includes('javascript') ? [350, 900] : [];
  if (speeds.length === 0) console.log('SKIP  Controlled wake comparison requires the Astro dev server');

  async function capture(kind, speed) {
    return page.evaluate(async ({ kind, speed }) => {
      const script = await fetch('/src/scripts/ripple.ts').then(response => response.text());
      const modulePath = script.match(/from "([^"]*pong-ripples[^"]*)"/)[1];
      const { publishPongRipples } = await import(modulePath);
      const canvas = document.querySelector('[data-ripple-background]');
      const context = canvas.getContext('2d');
      const motionMs = 1000;
      const checkpoints = [750, 1500, 3700];
      const origin = { x: 120, y: 350 };
      const samples = [];
      let inputFinished = false;
      publishPongRipples({ ownsSurface: kind === 'ball', ball: null, impact: false });
      await new Promise(resolve => setTimeout(resolve, 1100));
      window.dispatchEvent(new Event('blur'));

      return new Promise(resolve => {
        const started = performance.now();
        function frame(now) {
          const elapsed = now - started;
          const x = origin.x + speed * Math.min(elapsed, motionMs) / 1000;
          if (!inputFinished) {
            if (kind === 'pointer') {
              document.dispatchEvent(new PointerEvent('pointermove', {
                bubbles: true, pointerType: 'mouse', clientX: x, clientY: origin.y,
              }));
            } else {
              publishPongRipples({ ownsSurface: true, ball: { x, y: origin.y, speed }, impact: false });
            }
            inputFinished = elapsed >= motionMs;
          }
          if (elapsed >= checkpoints[samples.length]) {
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let peak = 0;
            let total = 0;
            let nearby = 0;
            for (let row = 0; row < canvas.height; row++) {
              for (let column = 0; column < canvas.width; column++) {
                const alpha = pixels[(row * canvas.width + column) * 4 + 3];
                peak = Math.max(peak, alpha);
                total += alpha;
                const dx = column * innerWidth / canvas.width - x;
                const dy = row * innerHeight / canvas.height - origin.y;
                if (dx >= -120 && dx <= 20 && Math.abs(dy) <= 45) nearby += alpha;
              }
            }
            samples.push({ peak, total, nearFraction: total ? nearby / total : 0, source: canvas.dataset.rippleSource });
          }
          if (samples.length === checkpoints.length) return resolve(samples);
          requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
    }, { kind, speed });
  }

  for (const speed of speeds) {
    const pointer = await capture('pointer', speed);
    const ball = await capture('ball', speed);
    assert.equal(pointer[0].source, 'pointer');
    assert.equal(ball[0].source, 'pong');
    assert.ok(pointer[0].peak > 30, `Pointer reference is visible at ${speed} px/s`);
    assert.ok(ball[0].peak >= pointer[0].peak * 0.7, `Ball wake stays as readable as the pointer at ${speed} px/s`);
    assert.ok(ball[0].nearFraction >= pointer[0].nearFraction * 0.6, `Ball wake stays concentrated around its trail at ${speed} px/s`);
    assert.ok(ball[1].peak >= pointer[1].peak * 0.7, `Ball wake remains visible briefly after movement at ${speed} px/s`);
    assert.equal(pointer[2].total, 0);
    assert.equal(ball[2].total, 0);
    console.log(`PASS  Ball wake matches the pointer's visibility, stays concentrated, and settles at ${speed} px/s`);
  }
  assert.deepEqual(errors, []);
  console.log('PASS  No browser runtime errors');
} finally {
  await browser.close();
}
