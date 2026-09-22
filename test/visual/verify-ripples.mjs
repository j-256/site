import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:4321';
const DESKTOP = Object.freeze({ width: 1440, height: 1000 });
const MOBILE = Object.freeze({ width: 390, height: 844 });
const SETTLE_TIMEOUT_MS = 6500;
const screenshotDirectory = await mkdtemp(join(tmpdir(), 'site-ripples-'));
const browser = await chromium.launch();
const errors = [];

function readSurface(selector = '[data-ripple-background]') {
  const canvas = document.querySelector(selector);
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let ink = 0;
  let gray = true;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    ink++;
    gray &&= pixels[index] === pixels[index + 1] && pixels[index] === pixels[index + 2];
  }
  return {
    ink,
    gray,
    pixels: canvas.width * canvas.height,
    pointerEvents: getComputedStyle(canvas).pointerEvents,
    position: getComputedStyle(canvas).position,
    hidden: canvas.getAttribute('aria-hidden'),
    width: canvas.getBoundingClientRect().width,
    height: canvas.getBoundingClientRect().height,
  };
}

async function openPage(options = {}, query = '') {
  const context = await browser.newContext({ viewport: DESKTOP, reducedMotion: 'no-preference', ...options });
  await context.addInitScript(() => sessionStorage.setItem('bootSeen', '1'));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${SITE_URL}/${query}`, { waitUntil: 'networkidle' });
  return page;
}

async function drawWake(page) {
  await page.mouse.move(80, 200);
  await page.mouse.move(700, 450, { steps: 25 });
  await page.waitForTimeout(100);
}

async function verifyNameplate(page, screenshot) {
  const header = await page.locator('[data-hostbar]').boundingBox();
  const y = header.y + header.height / 2;
  await page.mouse.move(header.x - 40, y);
  await page.mouse.move(header.x + header.width + 40, y, { steps: 30 });
  const surface = await page.evaluate(readSurface, '[data-ripple-surface]');
  assert.ok(surface.ink > 100);
  assert.equal(surface.gray, true);
  assert.equal(surface.pointerEvents, 'none');
  assert.equal(surface.position, 'absolute');
  assert.equal(surface.hidden, 'true');
  assert.equal(surface.width, header.width);
  assert.ok(Math.abs(surface.height - header.height) <= 1);
  await page.screenshot({ path: join(screenshotDirectory, screenshot) });
}

try {
  const page = await openPage();
  assert.equal((await page.evaluate(readSurface)).ink, 0);
  await drawWake(page);
  const active = await page.evaluate(readSurface);
  assert.ok(active.ink > 100);
  assert.equal(active.gray, true);
  assert.equal(active.pointerEvents, 'none');
  assert.equal(active.hidden, 'true');
  const before = await page.locator('[data-ripple-background]').evaluate(canvas => canvas.toDataURL());
  await page.waitForTimeout(180);
  const after = await page.locator('[data-ripple-background]').evaluate(canvas => canvas.toDataURL());
  assert.notEqual(before, after);
  await page.screenshot({ path: join(screenshotDirectory, 'desktop.png') });
  console.log('PASS  Mouse movement produces evolving grayscale waves behind content');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(1100);
  await verifyNameplate(page, 'nameplate.png');
  console.log('PASS  Ripples continue behind the nameplate without covering its text or controls');

  await page.waitForFunction(() => {
    const canvas = document.querySelector('[data-ripple-background]');
    return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.every(value => value === 0);
  }, null, { timeout: SETTLE_TIMEOUT_MS });
  console.log('PASS  The surface clears after input stops');
  assert.equal((await page.evaluate(readSurface, '[data-ripple-surface]')).ink, 0);

  await page.locator('a[href="#links"]').click();
  assert.ok(await page.evaluate(() => window.scrollY > 0));
  await page.waitForFunction(() => document.querySelector('[data-hostbar]').hasAttribute('data-stuck'));
  await verifyNameplate(page, 'sticky-nameplate.png');
  console.log('PASS  The sticky nameplate keeps the water aligned while covering scrolled content');
  await page.setViewportSize(MOBILE);
  await page.waitForFunction(() => {
    const canvas = document.querySelector('[data-ripple-background]');
    return Math.abs(canvas.width / canvas.height - window.innerWidth / window.innerHeight) < 0.01;
  });
  const resized = await page.evaluate(readSurface);
  assert.equal(resized.width, MOBILE.width);
  assert.equal(resized.height, MOBILE.height);
  assert.equal(resized.ink, 0);
  console.log('PASS  Links remain clickable and the surface follows viewport resizing');
  await page.context().close();

  for (const [query, reducedMotion, enabled] of [
    ['', 'reduce', false],
    ['?animate=1', 'reduce', true],
    ['?animate=0', 'no-preference', false],
    ['?animate=false', 'reduce', false],
  ]) {
    const preferencePage = await openPage({ reducedMotion }, query);
    await drawWake(preferencePage);
    const surface = await preferencePage.evaluate(readSurface);
    assert.equal(surface.ink > 0, enabled, `${query || 'system'} with ${reducedMotion}`);
    await preferencePage.context().close();
  }
  console.log('PASS  System reduced motion and explicit animation overrides are respected');

  const preferencePage = await openPage();
  await drawWake(preferencePage);
  await preferencePage.emulateMedia({ reducedMotion: 'reduce' });
  await preferencePage.waitForFunction(() => {
    const canvas = document.querySelector('[data-ripple-background]');
    return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.every(value => value === 0);
  });
  assert.equal((await preferencePage.evaluate(readSurface, '[data-ripple-surface]')).ink, 0);
  await preferencePage.emulateMedia({ reducedMotion: 'no-preference' });
  await drawWake(preferencePage);
  assert.ok((await preferencePage.evaluate(readSurface)).ink > 0);
  await preferencePage.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  assert.equal((await preferencePage.evaluate(readSurface)).ink, 0);
  await preferencePage.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await drawWake(preferencePage);
  assert.ok((await preferencePage.evaluate(readSurface)).ink > 0);
  await preferencePage.context().close();
  console.log('PASS  Motion changes and page lifecycle resets preserve later interaction');

  const touchPage = await openPage({ viewport: MOBILE, hasTouch: true, isMobile: true });
  const cdp = await touchPage.context().newCDPSession(touchPage);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: 130, y: 620 }],
  });
  for (let step = 1; step <= 12; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: 130 + step * 5, y: 620 - step * 25 }],
    });
    await touchPage.waitForTimeout(25);
  }
  assert.ok((await touchPage.evaluate(readSurface)).ink > 100);
  assert.ok(await touchPage.evaluate(() => window.scrollY > 100));
  assert.equal(await touchPage.locator('[data-pong-background]').getAttribute('data-pong-state'), 'idle');
  assert.equal(await touchPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await touchPage.screenshot({ path: join(screenshotDirectory, 'touch.png') });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touchPage.context().close();
  console.log('PASS  Real touch gestures leave ripples while scrolling without starting Pong');

  assert.deepEqual(errors, []);
  console.log('PASS  No browser runtime errors');
  console.log(`Screenshots: ${screenshotDirectory}`);
} finally {
  await browser.close();
}
