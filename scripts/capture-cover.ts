import { existsSync } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { preview } from 'astro';
import { chromium } from 'playwright';

import { SITE_REPOSITORY } from '../src/data/projects';
import {
  PROJECT_RELEASE_MANIFEST_PATH,
  assertProjectCoverImage,
  projectCoverAssetPath,
} from '../src/lib/project-assets';
import {
  parseProjectReleaseManifest,
  projectCoverSha256,
  updateProjectReleaseCover,
} from '../src/lib/project-release-manifest';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..');
const COVER_PATH = resolve(PROJECT_ROOT, 'docs/screenshots/cover.png');
const DIST_DIRECTORY = resolve(PROJECT_ROOT, 'dist');
const DIST_COVER_PATH = resolve(DIST_DIRECTORY, projectCoverAssetPath(SITE_REPOSITORY));
const DIST_MANIFEST_PATH = resolve(DIST_DIRECTORY, PROJECT_RELEASE_MANIFEST_PATH);
const PREVIEW_HOST = '127.0.0.1';
const SUMMARY_PATH = process.env.GITHUB_STEP_SUMMARY;

export const CAPTURE_VIEWPORT = Object.freeze({ width: 1440, height: 1000 });
export const CAPTURE_CONTEXT = Object.freeze({
  colorScheme: 'dark' as const,
  deviceScaleFactor: 1,
  reducedMotion: 'reduce' as const,
  viewport: CAPTURE_VIEWPORT,
});
export const EXIT_STATUS = Object.freeze({
  RUNTIME_FAILURE: 1,
  USAGE_ERROR: 2,
  MISSING_DEPENDENCY: 3,
});

export type CaptureMode = 'capture' | 'help';

export class CaptureCliError extends Error {
  constructor(
    message: string,
    readonly exitCode: number
  ) {
    super(message);
  }
}

export function captureHelp(): string {
  return `Usage: npm run capture:cover -- [options]

Build and render the candidate site locally, replace docs/screenshots/cover.png
with a deterministic 1440x1000 PNG, and synchronize its project asset in dist.

Options:
  -h, --help  Show this help and exit

Environment:
  SITE_HOST                Required directly or through .env
  GITHUB_TOKEN, GH_TOKEN   Optional GitHub API credentials
  PROJECT_REPOSITORY_ROOT  Optional root containing local project checkouts

Dependencies:
  Install packages with npm ci and Chromium with npx playwright install chromium.

Exit statuses:
  0  Cover captured successfully or help shown
  1  Build, render, validation, or file operation failed
  2  Invalid command usage
  3  npm or Playwright Chromium is unavailable`;
}

export function parseCaptureArguments(argumentsList: readonly string[]): CaptureMode {
  let endOfOptions = false;
  let help = false;

  for (const argument of argumentsList) {
    if (!endOfOptions && argument === '--') {
      endOfOptions = true;
    } else if (!endOfOptions && (argument === '-h' || argument === '--help')) {
      help = true;
    } else {
      throw new CaptureCliError(`unexpected argument: ${argument}`, EXIT_STATUS.USAGE_ERROR);
    }
  }

  return help ? 'help' : 'capture';
}

function runBuild(): void {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(command, ['run', 'build'], {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: 'inherit',
  });

  if ((result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
    throw new CaptureCliError('npm is unavailable', EXIT_STATUS.MISSING_DEPENDENCY);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new CaptureCliError(
      `production build exited with status ${result.status ?? 'unknown'}`,
      EXIT_STATUS.RUNTIME_FAILURE
    );
  }
}

async function replaceFile(path: string, contents: Uint8Array | string): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, contents, { flag: 'wx' });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function synchronizeBuiltCover(image: Uint8Array): Promise<boolean> {
  const previousCover = await readFile(DIST_COVER_PATH);
  const manifest = parseProjectReleaseManifest(
    JSON.parse(await readFile(DIST_MANIFEST_PATH, 'utf8')) as unknown
  );
  const updatedManifest = updateProjectReleaseCover(manifest, SITE_REPOSITORY, image);
  await replaceFile(DIST_COVER_PATH, image);
  await replaceFile(DIST_MANIFEST_PATH, `${JSON.stringify(updatedManifest, null, 2)}\n`);
  return projectCoverSha256(previousCover) !== projectCoverSha256(image);
}

async function emitCoverSummary(changed: boolean): Promise<void> {
  const status = changed ? 'updated' : 'unchanged';
  console.log(`Generated project cover: ${SITE_REPOSITORY}: cover ${status}`);
  if (SUMMARY_PATH) {
    await writeFile(
      SUMMARY_PATH,
      `\n### Generated site cover\n\n- ${SITE_REPOSITORY}: cover ${status}\n`,
      { flag: 'a' }
    );
  }
}

export function verifyBrowserExecutable(executablePath: string): void {
  if (!existsSync(executablePath)) {
    throw new CaptureCliError(
      'Playwright Chromium is unavailable; run npx playwright install chromium',
      EXIT_STATUS.MISSING_DEPENDENCY
    );
  }
}

async function captureCover(): Promise<void> {
  verifyBrowserExecutable(chromium.executablePath());
  runBuild();

  const server = await preview({
    root: PROJECT_ROOT,
    logLevel: 'silent',
    server: { host: PREVIEW_HOST, port: 0 },
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    try {
      browser = await chromium.launch();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new CaptureCliError(
        `Playwright Chromium could not launch: ${detail}`,
        EXIT_STATUS.MISSING_DEPENDENCY
      );
    }
    const context = await browser.newContext(CAPTURE_CONTEXT);
    const page = await context.newPage();
    const browserErrors: string[] = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push(message.text());
    });
    const url = `http://${PREVIEW_HOST}:${server.port}/`;
    const response = await page.goto(url, { waitUntil: 'networkidle' });
    if (!response?.ok()) {
      throw new Error(`preview returned HTTP ${response?.status() ?? 'unknown'}`);
    }

    const state = await page.evaluate(async () => {
      await document.fonts.ready;
      const overlay = document.querySelector(
        '[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay'
      );
      return {
        bodyHasContent: document.body.innerText.trim().length > 0,
        hasBoot: document.querySelector('[data-boot]') !== null,
        hasProjects:
          Number(document.querySelector('[data-row-count]')?.getAttribute('data-row-count')) > 0,
        hasOverlay: overlay !== null,
        previewClosed:
          !document.querySelector('[data-project-preview]')?.hasAttribute('data-visible'),
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      };
    });
    if (!state.bodyHasContent || !state.hasBoot || !state.hasProjects) {
      throw new Error('preview did not render the expected page content');
    }
    if (state.hasOverlay) throw new Error('preview rendered a framework error overlay');
    if (!state.previewClosed) throw new Error('preview opened before the cover was captured');
    if (browserErrors.length > 0) {
      throw new Error(`preview reported browser errors: ${browserErrors.join('; ')}`);
    }
    if (state.scrollX !== 0 || state.scrollY !== 0) {
      throw new Error(`preview opened at scroll position ${state.scrollX},${state.scrollY}`);
    }

    const image = await page.screenshot({
      animations: 'disabled',
      fullPage: false,
      type: 'png',
    });
    const dimensions = assertProjectCoverImage(image, { contentType: 'image/png' });
    if (
      dimensions.width !== CAPTURE_VIEWPORT.width
      || dimensions.height !== CAPTURE_VIEWPORT.height
    ) {
      throw new Error(
        `captured ${dimensions.width}x${dimensions.height}, expected `
        + `${CAPTURE_VIEWPORT.width}x${CAPTURE_VIEWPORT.height}`
      );
    }

    const coverChanged = await synchronizeBuiltCover(image);
    await replaceFile(COVER_PATH, image);
    await emitCoverSummary(coverChanged);
  } finally {
    if (browser) await browser.close();
    await server.stop();
  }

  console.log(`Wrote ${COVER_PATH} and synchronized the built project cover`);
}

export async function main(argumentsList = process.argv.slice(2)): Promise<void> {
  const mode = parseCaptureArguments(argumentsList);
  if (mode === 'help') {
    console.log(captureHelp());
    return;
  }
  await captureCover();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`capture-cover: ${detail}`);
    if (error instanceof CaptureCliError && error.exitCode === EXIT_STATUS.USAGE_ERROR) {
      console.error('Try npm run capture:cover -- --help');
    }
    process.exitCode = error instanceof CaptureCliError
      ? error.exitCode
      : EXIT_STATUS.RUNTIME_FAILURE;
  });
}
