import { chromium } from 'playwright';

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:4321';
const STICKY_TOLERANCE_PX = 2;
const SHORT_VIEWPORT = { width: 390, height: 640 };

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: SHORT_VIEWPORT,
  reducedMotion: 'reduce',
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();
let failures = 0;

function report(label, pass, detail = '') {
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
}

await page.goto(SITE_URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

const projects = page.locator('.projects');
const details = page.locator('[data-project-disclosure]');
const summary = page.locator('[data-project-disclosure-summary]');
const initialRows = page.locator('.initial-projects .row-link');
const disclosedRows = page.locator('.disclosed-projects .row-link');
const topShortcut = page.locator('[data-top-shortcut]');

const readTopShortcutState = () => topShortcut.evaluate(element => ({
  animationName: getComputedStyle(element).animationName,
  ariaHidden: element.getAttribute('aria-hidden'),
  tabIndex: element.tabIndex,
  visibility: getComputedStyle(element).visibility,
}));

const initialTopShortcut = await readTopShortcutState();
report(
  '[top] stays hidden and unfocusable before the header sticks',
  initialTopShortcut.ariaHidden === 'true' &&
    initialTopShortcut.tabIndex === -1 &&
    initialTopShortcut.visibility === 'hidden'
);

const inventory = {
  total: Number(await projects.getAttribute('data-row-count')),
  initial: Number(await projects.getAttribute('data-initial-row-count')),
  disclosed: Number(await projects.getAttribute('data-disclosed-row-count')),
};
report(
  'declares two non-empty inventories that cover every project',
  inventory.initial > 0 &&
    inventory.disclosed > 0 &&
    inventory.total === inventory.initial + inventory.disclosed &&
    (await initialRows.count()) === inventory.initial &&
    (await disclosedRows.count()) === inventory.disclosed
);
report('starts collapsed', !(await details.evaluate(element => element.open)));
report(
  'only initial projects are visible before expansion',
  (await initialRows.filter({ visible: true }).count()) === inventory.initial &&
    (await disclosedRows.filter({ visible: true }).count()) === 0
);
report(
  'closed summary reports the disclosed count',
  (await summary.innerText()).trim() === `[+] show ${inventory.disclosed} more projects`
);

await summary.click();
report('pointer activation opens the disclosure', await details.evaluate(element => element.open));
report(
  'expansion reveals every disclosed project',
  (await disclosedRows.filter({ visible: true }).count()) === inventory.disclosed
);
report(
  'open summary offers the inverse action',
  (await summary.innerText()).trim() === `[-] hide ${inventory.disclosed} more projects`
);

const middleRow = disclosedRows.nth(Math.floor(inventory.disclosed / 2));
await middleRow.scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, 100));
await page.waitForFunction(() => document.querySelector('[data-hostbar]')?.hasAttribute('data-stuck'));
const stuckTopShortcut = await readTopShortcutState();
report(
  '[top] appears and becomes focusable with the sticky header',
  stuckTopShortcut.ariaHidden === null &&
    stuckTopShortcut.tabIndex === 0 &&
    stuckTopShortcut.visibility === 'visible'
);
report(
  'reduced motion reveals [top] without typing',
  stuckTopShortcut.animationName === 'none'
);
const stickyGeometry = await page.evaluate(() => {
  const hostbar = document.querySelector('.hostbar');
  const disclosureSummary = document.querySelector('[data-project-disclosure-summary]');
  if (!hostbar || !disclosureSummary) return null;
  const hostbarRect = hostbar.getBoundingClientRect();
  const summaryRect = disclosureSummary.getBoundingClientRect();
  return {
    hostbarBottom: hostbarRect.bottom,
    summaryTop: summaryRect.top,
    summaryBottom: summaryRect.bottom,
    viewportHeight: window.innerHeight,
  };
});
report(
  'open summary sticks immediately below the hostbar',
  stickyGeometry !== null &&
    Math.abs(stickyGeometry.summaryTop - stickyGeometry.hostbarBottom) <= STICKY_TOLERANCE_PX,
  stickyGeometry
    ? `hostbar=${stickyGeometry.hostbarBottom.toFixed(1)} summary=${stickyGeometry.summaryTop.toFixed(1)}`
    : 'missing geometry'
);
report(
  'stacked controls leave useful short-screen content space',
  stickyGeometry !== null &&
    stickyGeometry.viewportHeight - stickyGeometry.summaryBottom >= SHORT_VIEWPORT.height / 2
);

await summary.click();
await page.waitForFunction(() => !document.querySelector('[data-project-disclosure]')?.open);
await page.waitForFunction(() => {
  const hostbar = document.querySelector('.hostbar');
  const disclosureSummary = document.querySelector('[data-project-disclosure-summary]');
  if (!hostbar || !disclosureSummary) return false;
  const hostbarRect = hostbar.getBoundingClientRect();
  const summaryRect = disclosureSummary.getBoundingClientRect();
  return summaryRect.top >= hostbarRect.bottom && summaryRect.bottom <= window.innerHeight;
});
report('mid-list collapse returns to the disclosure boundary', await summary.isVisible());
report('collapse keeps focus on its control', await summary.evaluate(element => document.activeElement === element));

await summary.focus();
await page.keyboard.press('Enter');
report('keyboard activation opens the disclosure', await details.evaluate(element => element.open));
await page.keyboard.press('Enter');
await page.waitForFunction(() => !document.querySelector('[data-project-disclosure]')?.open);
report('keyboard activation closes the disclosure', !(await details.evaluate(element => element.open)));

await page.locator('.page-shortcut[href="#links"]').click();
await page.waitForFunction(() => window.location.hash === '#links');
const linksLanding = await page.evaluate(() => {
  const target = document.querySelector('#links');
  const hostbar = document.querySelector('.hostbar');
  if (!target || !hostbar) return null;
  const targetRect = target.getBoundingClientRect();
  return {
    focused: document.activeElement === target,
    visible: targetRect.bottom > hostbar.getBoundingClientRect().bottom && targetRect.top < window.innerHeight,
  };
});
report(
  '[links] moves focus to an unobscured links section',
  linksLanding?.focused === true && linksLanding.visible
);

await page.locator('.page-shortcut[href="#top"]').click();
await page.waitForFunction(() => window.location.hash === '#top');
await page.waitForFunction(() => !document.querySelector('[data-hostbar]')?.hasAttribute('data-stuck'));
const topLanding = await page.evaluate(() => ({
  focused: document.activeElement?.id === 'top',
  scrollY: window.scrollY,
}));
report('[top] moves focus to the page start', topLanding.focused && topLanding.scrollY <= 1);
const releasedTopShortcut = await readTopShortcutState();
report(
  '[top] hides again when the header releases',
  releasedTopShortcut.ariaHidden === 'true' &&
    releasedTopShortcut.tabIndex === -1 &&
    releasedTopShortcut.visibility === 'hidden'
);

await page.emulateMedia({ reducedMotion: 'no-preference' });
await topShortcut.evaluate(element => {
  window.__topShortcutAnimationStarts = 0;
  element.addEventListener('animationstart', () => {
    window.__topShortcutAnimationStarts++;
  });
});
await page.locator('.page-shortcut[href="#links"]').click();
await page.waitForFunction(() => window.__topShortcutAnimationStarts >= 1);
await topShortcut.click();
await page.waitForFunction(() => !document.querySelector('[data-hostbar]')?.hasAttribute('data-stuck'));
await page.locator('.page-shortcut[href="#links"]').click();
await page.waitForFunction(() => window.__topShortcutAnimationStarts >= 2);
report(
  '[top] types in again after crossing the sticky threshold again',
  (await page.evaluate(() => window.__topShortcutAnimationStarts)) >= 2
);
await topShortcut.click();
await page.waitForFunction(() => !document.querySelector('[data-hostbar]')?.hasAttribute('data-stuck'));

await page.setViewportSize({ width: 320, height: SHORT_VIEWPORT.height });
const narrowHeader = await page.evaluate(tolerance => {
  const line = document.querySelector('.hostbar-topline');
  const wordmark = document.querySelector('.wordmark');
  const shortcuts = document.querySelector('.page-shortcuts');
  if (!line || !wordmark || !shortcuts) return null;
  const lineRect = line.getBoundingClientRect();
  const wordmarkRect = wordmark.getBoundingClientRect();
  const shortcutsRect = shortcuts.getBoundingClientRect();
  return {
    noOverflow: line.scrollWidth <= line.clientWidth,
    separated: wordmarkRect.right <= shortcutsRect.left,
    sameRow: Math.abs(wordmarkRect.top + wordmarkRect.height / 2 - (shortcutsRect.top + shortcutsRect.height / 2)) <= tolerance,
    inside: shortcutsRect.right <= lineRect.right + tolerance,
  };
}, STICKY_TOLERANCE_PX);
report(
  'shortcuts share one non-overflowing row with the wordmark at 320px',
  narrowHeader !== null && Object.values(narrowHeader).every(Boolean)
);

await context.close();
await browser.close();
console.log(failures === 0 ? 'ALL PASS' : `${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
