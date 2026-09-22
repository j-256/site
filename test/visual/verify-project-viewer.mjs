import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright';

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:4321';
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch();

async function capture(page, name) {
  if (!SCREENSHOT_DIR) return;
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: join(SCREENSHOT_DIR, `${name}.png`) });
}

function readViewer() {
  const image = document.querySelector('[data-viewer-image]');
  const stage = document.querySelector('[data-viewer-stage]');
  const close = document.querySelector('[data-viewer-close]');
  const dialog = document.querySelector('[data-project-viewer]');
  return {
    image: image.getBoundingClientRect().toJSON(),
    stage: stage.getBoundingClientRect().toJSON(),
    close: close.getBoundingClientRect().toJSON(),
    zoom: Number.parseInt(document.querySelector('[data-viewer-zoom]').value, 10),
    pageScale: visualViewport.scale,
    pageScroll: scrollY,
    overflow: dialog.scrollWidth > dialog.clientWidth,
  };
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  const page = await desktop.newPage();
  await page.goto(SITE_URL, { waitUntil: 'networkidle' });
  const trigger = page.locator('[data-project-preview-trigger]').first();
  for (const size of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1200, height: 500 }]) {
    await page.setViewportSize(size);
    await trigger.hover();
    await page.locator('[data-project-preview][data-visible][data-ready]').waitFor();
    const rect = await page.locator('.preview-window').boundingBox();
    assert.ok(rect.width <= size.width * 0.9 + 1);
    assert.ok(rect.height <= size.height * 0.85 + 1);
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.y + rect.height <= size.height);
    assert.ok(rect.width >= size.width * 0.89 || rect.height >= size.height * 0.84);
    const proportions = await page.locator('[data-preview-image]').evaluate(image => {
      const rect = image.getBoundingClientRect();
      return Math.abs(rect.width / rect.height - image.naturalWidth / image.naturalHeight);
    });
    assert.ok(proportions < 0.01);
    await capture(page, `desktop-${size.width}x${size.height}`);
    await page.mouse.move(0, 0);
  }
  console.log('PASS  Desktop previews grow to the viewport and fit short screens without letterboxing');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.locator('[data-project-disclosure] summary').click();
  await page.locator('[data-preview-name="binary-watch-face"] [data-project-preview-trigger]').hover();
  await page.locator('[data-project-preview][data-visible][data-ready]').waitFor();
  assert.ok(await page.locator('[data-preview-image]').evaluate(image => image.getBoundingClientRect().width <= image.naturalWidth + 1));
  await capture(page, 'desktop-small-source');
  console.log('PASS  Small source images are not automatically enlarged beyond their native resolution');
  const desktopButton = page.locator('[data-project-viewer-open]').first();
  assert.ok(await desktopButton.isVisible());
  const buttonStyle = await desktopButton.evaluate(button => {
    const style = getComputedStyle(button);
    return { color: style.color, background: style.backgroundColor, font: style.fontFamily };
  });
  assert.equal(buttonStyle.color, 'rgb(41, 254, 19)');
  assert.equal(buttonStyle.background, 'rgba(0, 0, 0, 0)');
  assert.ok(buttonStyle.font.includes('JetBrains Mono'));
  await desktopButton.click();
  await page.locator('[data-project-viewer][data-ready]').waitFor();
  await page.keyboard.press('+');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal((await page.evaluate(readViewer)).zoom, 150, 'Opening a cached cover preserves immediate zoom');
  await page.keyboard.press('0');
  const desktopBefore = await page.evaluate(readViewer);
  const anchor = { x: desktopBefore.stage.x + desktopBefore.stage.width / 2 + 80,
    y: desktopBefore.stage.y + desktopBefore.stage.height / 2 - 40 };
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.wheel(0, -400);
  await page.waitForFunction(() => Number.parseInt(document.querySelector('[data-viewer-zoom]').value, 10) > 100);
  const desktopZoomed = await page.evaluate(readViewer);
  for (const [axis, dimension] of [['x', 'width'], ['y', 'height']]) {
    const before = (anchor[axis] - desktopBefore.image[axis]) / desktopBefore.image[dimension];
    const after = (anchor[axis] - desktopZoomed.image[axis]) / desktopZoomed.image[dimension];
    assert.ok(Math.abs(before - after) < 0.002, 'Wheel zoom keeps the image point beneath the pointer');
  }
  await page.mouse.down();
  await page.mouse.move(anchor.x + 90, anchor.y + 40, { steps: 5 });
  await page.mouse.up();
  const desktopPanned = await page.evaluate(readViewer);
  assert.ok(Math.abs(desktopPanned.image.x - desktopZoomed.image.x - 90) < 2);
  assert.equal(desktopPanned.pageScale, 1);
  assert.equal(desktopPanned.pageScroll, desktopBefore.pageScroll);
  await capture(page, 'desktop-expanded-zoom');
  await page.keyboard.press('0');
  assert.equal((await page.evaluate(readViewer)).zoom, 100);
  await page.keyboard.press('+');
  assert.equal((await page.evaluate(readViewer)).zoom, 150);
  await page.keyboard.press('-');
  assert.equal((await page.evaluate(readViewer)).zoom, 100);
  await page.keyboard.press('Escape');
  assert.ok(await desktopButton.evaluate(button => document.activeElement === button));
  console.log('PASS  Styled desktop controls open the viewer with anchored wheel zoom, mouse pan, keyboard zoom, and focus restoration');
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const mobilePage = await mobile.newPage();
  const errors = [];
  mobilePage.on('pageerror', error => errors.push(error.message));
  const mobileURL = new URL(SITE_URL);
  mobileURL.searchParams.set('animate', '1');
  await mobilePage.goto(mobileURL.href, { waitUntil: 'networkidle' });
  const button = mobilePage.locator('[data-project-viewer-open]').first();
  const image = mobilePage.locator('[data-viewer-image]');
  const close = mobilePage.locator('[data-viewer-close]');
  const fit = mobilePage.locator('[data-viewer-fit]');
  const zoomIn = mobilePage.locator('[data-viewer-zoom-in]');
  const zoomOut = mobilePage.locator('[data-viewer-zoom-out]');
  assert.equal(await image.getAttribute('src'), null);
  assert.ok(await button.isVisible());
  await button.scrollIntoViewIfNeeded();
  const scrollBefore = await mobilePage.evaluate(() => scrollY);
  await capture(mobilePage, 'mobile-project-list');
  await button.tap();
  await mobilePage.locator('[data-project-viewer][data-ready]').waitFor();
  let geometry = await mobilePage.evaluate(readViewer);
  assert.ok(geometry.image.width >= 370);
  assert.ok(geometry.close.y >= 0 && geometry.close.bottom <= 844);
  assert.equal(geometry.zoom, 100);
  assert.equal(geometry.overflow, false);
  assert.ok(await close.evaluate(element => document.activeElement === element));
  await capture(mobilePage, 'mobile-fit');
  console.log('PASS  Touch preview opens a labelled dialog with a fitted image and reachable close control');

  await mobilePage.keyboard.press('Tab');
  assert.ok(await zoomIn.evaluate(element => document.activeElement === element));
  await mobilePage.keyboard.press('Tab');
  assert.ok(await close.evaluate(element => document.activeElement === element));
  await zoomIn.tap();
  assert.equal((await mobilePage.evaluate(readViewer)).zoom, 150);
  await zoomOut.tap();
  assert.equal((await mobilePage.evaluate(readViewer)).zoom, 100);
  await zoomIn.tap();
  await fit.tap();
  assert.equal((await mobilePage.evaluate(readViewer)).zoom, 100);
  console.log('PASS  Focus stays in the viewer and zoom buttons provide a gesture alternative');

  if (engine === chromium) {
    const cdp = await mobile.newCDPSession(mobilePage);
    geometry = await mobilePage.evaluate(readViewer);
    const center = { x: geometry.stage.x + geometry.stage.width / 2, y: geometry.stage.y + geometry.stage.height / 2 };
    const touchPoints = distance => [
      { x: center.x - distance, y: center.y, id: 1 },
      { x: center.x + distance, y: center.y, id: 2 },
    ];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoints(40) });
    for (let distance = 45; distance <= 120; distance += 5) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoints(distance) });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const pinched = await mobilePage.evaluate(readViewer);
    assert.ok(pinched.zoom >= 290 && pinched.zoom <= 310);
    assert.equal(pinched.pageScale, 1);
    assert.equal(pinched.pageScroll, scrollBefore);
    assert.equal(await mobilePage.locator('[data-pong-background]').getAttribute('data-pong-ball'), 'dormant');
    await capture(mobilePage, 'mobile-pinched');

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...center, id: 3 }] });
    for (let offset = 10; offset <= 120; offset += 10) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: center.x + offset, y: center.y, id: 3 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const panned = await mobilePage.evaluate(readViewer);
    assert.ok(panned.image.x > pinched.image.x + 100);
    assert.ok(panned.image.x <= panned.stage.x && panned.image.right >= panned.stage.right);
    await capture(mobilePage, 'mobile-panned');
    console.log('PASS  Real pinch and drag gestures zoom the image without zooming the page or starting Pong');
  }

  await mobilePage.keyboard.press('Escape');
  await mobilePage.waitForFunction(() => !document.querySelector('[data-project-viewer]').open);
  assert.ok(await button.evaluate(element => document.activeElement === element));
  assert.equal(await mobilePage.evaluate(() => scrollY), scrollBefore);
  assert.equal(await mobilePage.locator('[data-pong-background]').getAttribute('data-pong-ball'), 'dormant');
  console.log('PASS  Escape closes the viewer, restores focus and scroll, and leaves Pong dormant');

  await mobile.route('https://github.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Repository destination</title>' }));
  const link = mobilePage.locator('[data-project-preview-link]').first();
  const popupEvent = mobilePage.waitForEvent('popup');
  await link.tap();
  const popup = await popupEvent;
  await popup.waitForLoadState('domcontentloaded');
  assert.equal(popup.url(), await link.getAttribute('href'));
  await popup.close();
  console.log('PASS  Project links still open the repository directly');

  let allowImage = false;
  await mobilePage.route('**/project-assets/j-256/stowplan/cover.png', route => allowImage
    ? route.continue()
    : route.fulfill({ status: 503, contentType: 'text/plain', body: 'temporary failure' }));
  await mobilePage.reload({ waitUntil: 'networkidle' });
  await button.tap();
  await mobilePage.waitForFunction(() => document.querySelector('[data-viewer-status]').textContent.includes('unavailable'));
  assert.ok(await zoomIn.isDisabled());
  await capture(mobilePage, 'mobile-load-error');
  await close.tap();
  await mobilePage.waitForFunction(() => !document.querySelector('[data-project-viewer]').open);
  allowImage = true;
  await button.tap();
  await mobilePage.locator('[data-project-viewer][data-ready]').waitFor();
  assert.ok((await image.evaluate(element => element.naturalWidth)) > 0);
  console.log('PASS  Failed image loads explain retry and recover when reopened');

  await zoomIn.tap();
  await mobilePage.setViewportSize({ width: 844, height: 390 });
  await mobilePage.waitForFunction(() => document.querySelector('[data-viewer-zoom]').value === '100%');
  geometry = await mobilePage.evaluate(readViewer);
  assert.ok(geometry.image.y >= geometry.stage.y && geometry.image.bottom <= geometry.stage.bottom + 1);
  assert.ok(geometry.close.y >= 0 && geometry.close.bottom <= 390);
  assert.equal(geometry.overflow, false);
  await capture(mobilePage, 'mobile-landscape');
  await close.tap();
  await mobilePage.waitForFunction(() => !document.querySelector('[data-project-viewer]').open);
  await mobilePage.setViewportSize({ width: 320, height: 568 });
  await mobilePage.locator('[data-project-disclosure] summary').tap();
  const lastButton = mobilePage.locator('[data-project-viewer-open]').last();
  await lastButton.tap();
  await mobilePage.locator('[data-project-viewer][data-ready]').waitFor();
  geometry = await mobilePage.evaluate(readViewer);
  assert.equal(geometry.overflow, false);
  assert.ok(geometry.close.right <= 320);
  await capture(mobilePage, 'mobile-small-disclosed-project');
  await close.tap();
  await mobilePage.waitForFunction(() => !document.querySelector('[data-project-viewer]').open);
  assert.ok(await lastButton.evaluate(element => document.activeElement === element));
  assert.deepEqual(errors, []);
  console.log('PASS  Landscape rotation and narrow phones keep controls reachable, including disclosed projects');
  await mobile.close();
} finally {
  await browser.close();
}
