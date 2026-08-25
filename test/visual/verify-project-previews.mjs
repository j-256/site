import { chromium } from 'playwright';

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:4321';
const browser = await chromium.launch();
let failures = 0;

function report(label, pass, detail = '') {
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
}

const desktop = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const desktopPage = await desktop.newPage();
await desktopPage.goto(SITE_URL, { waitUntil: 'networkidle' });
const firstLink = desktopPage.locator('[data-project-preview-link]').first();
const secondLink = desktopPage.locator('[data-project-preview-link]').nth(1);
const siteLink = desktopPage.locator('[data-preview-name="site"]');
const roverLink = desktopPage.locator('[data-preview-name="rover-dumper"]');
const firstTrigger = firstLink.locator('[data-project-preview-trigger]');
const firstProgress = firstLink.locator('.preview-progress');
const firstAnnotation = firstLink.locator('.annotation');
const preview = desktopPage.locator('[data-project-preview]');
const previewImage = preview.locator('[data-preview-image]');
const previewDelay = Number(await desktopPage.locator('.projects').getAttribute('data-preview-delay'));
const rowBefore = await firstLink.boundingBox();
const triggerBefore = await firstTrigger.boundingBox();

report('desktop supports hover previews', await desktopPage.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches));
report('preview dwell balances intent and response', previewDelay >= 400 && previewDelay <= 600);
report('preview hotspot is narrower than the click target', Boolean(rowBefore && triggerBefore && triggerBefore.width < rowBefore.width));
report('preview image starts unloaded', (await previewImage.getAttribute('src')) === null);
report('preview starts hidden', (await preview.getAttribute('data-visible')) === null);

await firstAnnotation.hover();
await desktopPage.waitForTimeout(previewDelay + 50);
report('description hover does not charge preview', (await firstLink.getAttribute('data-preview-pending')) === null);
report('description hover does not show preview', (await preview.getAttribute('data-visible')) === null);

await firstTrigger.hover();
await desktopPage.waitForTimeout(Math.floor(previewDelay / 2));
report('entry hover starts the progress bar', (await firstLink.getAttribute('data-preview-pending')) === '');
report('progress bar is visible while charging', await firstProgress.evaluate(element => getComputedStyle(element).visibility === 'visible'));
report('progress bar visibly fills left to right', await firstProgress.evaluate(element => {
  const track = getComputedStyle(element);
  const fill = getComputedStyle(element, '::after');
  return track.position === 'absolute' && track.height === '2px' && fill.animationName === 'preview-charge' && fill.transformOrigin.startsWith('0px');
}));
report('partial dwell does not show preview', (await preview.getAttribute('data-visible')) === null);
await desktopPage.mouse.move(0, 0);
await desktopPage.waitForTimeout(previewDelay + 50);
report('leaving during dwell cancels preview', (await firstLink.getAttribute('data-preview-pending')) === null && (await preview.getAttribute('data-visible')) === null);
report('cancelled dwell leaves cover unloaded', (await previewImage.getAttribute('src')) === null);

await firstTrigger.hover();
await previewImage.waitFor({ state: 'visible' });
report('completed progress shows preview', (await preview.getAttribute('data-visible')) === '');
report('hover loads the selected cover', (await previewImage.getAttribute('src'))?.includes('/project-assets/j-256/stowplan/cover.png') === true);
report('preview does not intercept the pointer', await preview.evaluate(element => getComputedStyle(element).pointerEvents === 'none'));

const rowAfter = await firstLink.boundingBox();
report('preview does not move its row', JSON.stringify(rowAfter) === JSON.stringify(rowBefore));

await desktopPage.mouse.move(0, 0);
await desktopPage.waitForTimeout(50);
report('leaving the row hides preview', (await preview.getAttribute('data-visible')) === null);

await siteLink.locator('[data-project-preview-trigger]').hover();
await previewImage.waitFor({ state: 'visible' });
report('site entry shows its own preview', (await previewImage.getAttribute('src'))?.includes('/project-assets/j-256/site/cover.png') === true);
await desktopPage.mouse.move(0, 0);

await roverLink.locator('[data-project-preview-trigger]').hover();
await previewImage.waitFor({ state: 'visible' });
report('Rover entry renders its cover', (await previewImage.getAttribute('src'))?.includes('/project-assets/j-256/rover-dumper/cover.png') === true && (await previewImage.evaluate(element => element.naturalWidth)) > 0);
await desktopPage.mouse.move(0, 0);

await firstLink.evaluate(element => element.addEventListener('click', event => event.preventDefault(), { once: true }));
await firstTrigger.click();
await desktopPage.mouse.move(0, 0);
await desktopPage.waitForTimeout(previewDelay + 50);
report('pointer focus does not pin preview open', (await preview.getAttribute('data-visible')) === null);

await desktopPage.keyboard.press('Tab');
report('keyboard navigation reaches the next entry', await secondLink.evaluate(element => document.activeElement === element));
await desktopPage.waitForTimeout(Math.floor(previewDelay / 2));
report('keyboard focus charges before previewing', (await secondLink.getAttribute('data-preview-pending')) === '');
report('partial keyboard dwell stays hidden', (await preview.getAttribute('data-visible')) === null);
await previewImage.waitFor({ state: 'visible' });
report('keyboard focus shows preview', (await preview.getAttribute('data-visible')) === '');
report('focus selects the focused cover', (await previewImage.getAttribute('src'))?.includes('/project-assets/j-256/hookrelay/cover.png') === true);
await desktopPage.keyboard.press('Escape');
await desktopPage.waitForTimeout(previewDelay + 50);
report('Escape hides a focused preview', (await preview.getAttribute('data-visible')) === null);
await desktop.close();

const retryDesktop = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const retryPage = await retryDesktop.newPage();
let roverRequestCount = 0;
await retryPage.route('**/project-assets/j-256/rover-dumper/cover.png', async route => {
  roverRequestCount++;
  if (roverRequestCount === 1) await route.abort();
  else await route.continue();
});
await retryPage.goto(SITE_URL, { waitUntil: 'networkidle' });
const retryTrigger = retryPage.locator('[data-preview-name="rover-dumper"] [data-project-preview-trigger]');
const retryPreview = retryPage.locator('[data-project-preview]');
const retryImage = retryPreview.locator('[data-preview-image]');
await retryTrigger.hover();
await retryPage.locator('[data-project-preview][data-error]').waitFor();
report('failed Rover request explains how to retry', (await retryPreview.locator('[data-preview-loading]').textContent())?.includes('leave and retry') === true);
await retryPage.mouse.move(0, 0);
await retryTrigger.hover();
await retryImage.waitFor({ state: 'visible' });
report('Rover cover retries after a transient failure', roverRequestCount === 2 && (await retryImage.evaluate(element => element.naturalWidth)) > 0);
await retryDesktop.close();

const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const mobilePage = await mobile.newPage();
await mobilePage.goto(SITE_URL, { waitUntil: 'networkidle' });
const mobilePreview = mobilePage.locator('[data-project-preview]');
const mobileImage = mobilePreview.locator('[data-preview-image]');
await mobilePage.locator('[data-project-preview-link]').first().focus();
report('mobile does not advertise hover', !(await mobilePage.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)));
report('mobile leaves preview hidden', await mobilePreview.evaluate(element => getComputedStyle(element).display === 'none'));
report('mobile leaves cover unloaded', (await mobileImage.getAttribute('src')) === null);
report('mobile does not charge a preview', (await mobilePage.locator('[data-project-preview-link]').first().getAttribute('data-preview-pending')) === null);
await mobile.close();

await browser.close();
console.log(failures === 0 ? 'ALL PASS' : `${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
