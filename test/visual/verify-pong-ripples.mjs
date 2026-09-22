import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:4321';
const DESKTOP = Object.freeze({ width: 1000, height: 700 });
const MOBILE = Object.freeze({ width: 390, height: 844 });
const HANDOFF_SETTLE_MS = 1150;
const SURFACE_SETTLE_TIMEOUT_MS = 6500;
const GAME_SLEEP_TIMEOUT_MS = 9500;
const IMPACT_TIMEOUT_MS = 5000;
const screenshotDirectory = await mkdtemp(join(tmpdir(), 'site-pong-ripples-'));
const browser = await chromium.launch();
const errors = [];

function hasRipples() {
  const canvas = document.querySelector('[data-ripple-background]');
  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    .some((value, index) => index % 4 === 3 && value > 0);
}

async function openPage(options = {}) {
  const context = await browser.newContext({ viewport: DESKTOP, reducedMotion: 'no-preference', ...options });
  await context.addInitScript(() => sessionStorage.setItem('bootSeen', '1'));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(SITE_URL, { waitUntil: 'networkidle' });
  return page;
}

async function waitForSource(page, source) {
  await page.waitForFunction(expected => document.querySelector('[data-ripple-background]').dataset.rippleSource === expected, source);
}

async function returnBall(page) {
  return page.evaluate(timeout => new Promise(resolve => {
    const deadline = performance.now() + timeout;
    const canvas = document.querySelector('[data-pong-background]');
    function follow() {
      if (Number(canvas.dataset.pongBrightness) > 0) return resolve(true);
      if (performance.now() >= deadline) return resolve(false);
      const rect = document.querySelector('[data-pong-ball-emphasis]').getBoundingClientRect();
      document.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        pointerType: 'mouse',
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }));
      requestAnimationFrame(follow);
    }
    follow();
  }), IMPACT_TIMEOUT_MS);
}

try {
  const page = await openPage();
  await page.mouse.move(70, 100);
  await page.mouse.move(160, 140, { steps: 4 });
  await page.waitForFunction(hasRipples);
  await waitForSource(page, 'pointer');
  await page.keyboard.press('Escape');
  await waitForSource(page, 'pointer');
  assert.equal(await page.locator('[data-pong-background]').getAttribute('data-pong-brightness'), '0');
  assert.equal(await returnBall(page), true);
  await waitForSource(page, 'pong');
  await page.waitForTimeout(HANDOFF_SETTLE_MS);
  console.log('PASS  Water stays with the pointer until a real paddle return reveals Pong');

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await page.evaluate(hasRipples), false);
  await page.waitForFunction(hasRipples);
  await page.waitForTimeout(220);
  await page.screenshot({ path: join(screenshotDirectory, 'ball-wake.png') });
  console.log('PASS  The moving ball generates a wake without pointer input');

  await page.keyboard.press('p');
  await waitForSource(page, 'pong');
  await page.waitForFunction(() => {
    const canvas = document.querySelector('[data-ripple-background]');
    return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.every(value => value === 0);
  }, null, { timeout: SURFACE_SETTLE_TIMEOUT_MS });
  await page.mouse.move(100, 600);
  await page.mouse.move(900, 620, { steps: 12 });
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(hasRipples), false);
  await waitForSource(page, 'pong');
  console.log('PASS  Pausing settles the water and cursor movement cannot compete with revealed Pong');

  await page.keyboard.press('p');
  await page.waitForFunction(hasRipples);
  await page.keyboard.press('Escape');
  await waitForSource(page, 'pointer');
  await page.waitForTimeout(HANDOFF_SETTLE_MS);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.move(200, 600);
  await page.mouse.move(600, 500, { steps: 12 });
  await page.waitForFunction(hasRipples);
  await page.screenshot({ path: join(screenshotDirectory, 'cursor-restored.png') });
  console.log('PASS  Dismissing Pong restores the cursor wake');

  await page.keyboard.press('Escape');
  await waitForSource(page, 'pong');
  await page.keyboard.press('p');
  await page.waitForFunction(() => document.querySelector('[data-pong-background]').dataset.pongState === 'sleeping', null, { timeout: GAME_SLEEP_TIMEOUT_MS });
  await waitForSource(page, 'pointer');
  await page.keyboard.press('p');
  await waitForSource(page, 'pong');
  console.log('PASS  Sleep returns water to the cursor and waking a revealed game restores its ownership');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await waitForSource(page, 'pointer');
  assert.equal(await page.evaluate(hasRipples), false);
  await page.mouse.move(100, 150);
  await page.mouse.move(200, 250, { steps: 8 });
  assert.equal(await page.evaluate(hasRipples), false);
  await page.context().close();
  console.log('PASS  Reduced motion disables both sources during a revealed game');

  const touchPage = await openPage({ viewport: MOBILE, hasTouch: true, isMobile: true });
  const cdp = await touchPage.context().newCDPSession(touchPage);
  const touchPair = y => [{ id: 1, x: 60, y }, { id: 2, x: MOBILE.width - 60, y }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPair(MOBILE.height / 2) });
  await waitForSource(touchPage, 'pointer');
  const deadline = Date.now() + IMPACT_TIMEOUT_MS;
  while (await touchPage.locator('[data-pong-background]').getAttribute('data-pong-brightness') === '0' && Date.now() < deadline) {
    const rect = await touchPage.locator('[data-pong-ball-emphasis]').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPair(rect.y + rect.height / 2) });
    await touchPage.waitForTimeout(25);
  }
  assert.notEqual(await touchPage.locator('[data-pong-background]').getAttribute('data-pong-brightness'), '0');
  await waitForSource(touchPage, 'pong');
  await touchPage.waitForTimeout(HANDOFF_SETTLE_MS);
  await touchPage.waitForFunction(hasRipples);
  await touchPage.screenshot({ path: join(screenshotDirectory, 'touch-pong.png') });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await touchPage.locator('[data-pong-background]').getAttribute('data-pong-state'), 'paused');
  await waitForSource(touchPage, 'pong');
  assert.equal(await touchPage.evaluate(() => window.scrollY), 0);
  await touchPage.context().close();
  console.log('PASS  Two-thumb play hands the pond to the ball while preserving pause and gesture behavior');

  assert.deepEqual(errors, []);
  console.log('PASS  No browser runtime errors');
  console.log(`Screenshots: ${screenshotDirectory}`);
} finally {
  await browser.close();
}
