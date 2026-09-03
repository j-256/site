import { describe, expect, it } from 'vitest';

import {
  CAPTURE_CONTEXT,
  CAPTURE_VIEWPORT,
  EXIT_STATUS,
  captureHelp,
  parseCaptureArguments,
  verifyBrowserExecutable,
} from '../scripts/capture-cover';

describe('parseCaptureArguments', () => {
  it('captures by default and accepts an option terminator', () => {
    expect(parseCaptureArguments([])).toBe('capture');
    expect(parseCaptureArguments(['--'])).toBe('capture');
  });

  it('supports both help flags', () => {
    expect(parseCaptureArguments(['-h'])).toBe('help');
    expect(parseCaptureArguments(['--help'])).toBe('help');
  });

  it('rejects unknown options and positional arguments', () => {
    expect(() => parseCaptureArguments(['--verbose'])).toThrow(/unexpected argument/);
    expect(() => parseCaptureArguments(['cover.png'])).toThrow(/unexpected argument/);
    expect(() => parseCaptureArguments(['--', '--help'])).toThrow(/unexpected argument/);
  });
});

describe('cover capture contract', () => {
  it('uses the canonical viewport and stable media preferences', () => {
    expect(CAPTURE_VIEWPORT).toEqual({ width: 1440, height: 1000 });
    expect(CAPTURE_CONTEXT).toEqual({
      colorScheme: 'dark',
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
      viewport: CAPTURE_VIEWPORT,
    });
  });

  it('documents invocation, dependencies, environment, and statuses', () => {
    const help = captureHelp();
    expect(help).toContain('npm run capture:cover');
    expect(help).toContain('SITE_HOST');
    expect(help).toContain('playwright install chromium');
    expect(help).toContain('synchronize its project asset in dist');
    expect(help).toContain('Exit statuses:');
  });

  it('reports a missing browser as a dependency failure', () => {
    expect(() => verifyBrowserExecutable('/nonexistent/playwright-chromium')).toThrow(
      expect.objectContaining({ exitCode: EXIT_STATUS.MISSING_DEPENDENCY })
    );
  });
});
