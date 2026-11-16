import { describe, expect, it } from 'vitest';
import {
  BALL_WAKE_CONFIG,
  advanceBallWake,
  createBallWake,
  disturbBallWake,
  endBallWake,
  hasBallWake,
  moveBallWake,
  shadeBallWake,
} from '../src/lib/ball-wake';
import { RIPPLE_MAX_CELLS } from '../src/lib/ripple';

const SIZE = 300;
const MAX_ALPHA = 60;

function shade(wake: ReturnType<typeof createBallWake>, time: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(wake.field.width * wake.field.height * 4);
  shadeBallWake(wake, pixels, time, MAX_ALPHA);
  return pixels;
}

function peak(pixels: Uint8ClampedArray): number {
  return pixels.reduce((maximum, value, index) => index % 4 === 3 ? Math.max(maximum, value) : maximum, 0);
}

describe('Ball wake', () => {
  it('spreads outward behind and ahead of a stationary emission instead of chasing the heading', () => {
    const wake = createBallWake(SIZE, SIZE);
    moveBallWake(wake, 150, 150, 0);
    endBallWake(wake);
    for (let frame = 1; frame <= 45; frame++) advanceBallWake(wake, frame * 1000 / 60);
    const pixels = shade(wake, 750);
    const { width, height } = wake.field;
    let ahead = 0;
    let behind = 0;
    let outer = 0;
    for (let row = 1; row < height - 1; row++) {
      for (let column = 1; column < width - 1; column++) {
        const alpha = pixels[(row * width + column) * 4 + 3]!;
        if (column > width / 2) ahead += alpha;
        if (column < width / 2) behind += alpha;
        if (Math.hypot(column - width / 2, row - height / 2) > 5) outer += alpha;
      }
    }
    expect(ahead).toBeGreaterThan(0);
    expect(behind).toBe(ahead);
    expect(outer).toBeGreaterThan(0);
  });

  it('lights a round disturbance evenly on opposing diagonals', () => {
    const wake = createBallWake(SIZE, SIZE);
    moveBallWake(wake, 150, 150, 0);
    const pixels = shade(wake, 0);
    const alpha = (column: number, row: number) => pixels[(row * wake.field.width + column) * 4 + 3]!;
    expect(alpha(52, 52)).toBeGreaterThan(0);
    expect(alpha(52, 48)).toBe(alpha(52, 52));
  });

  it('samples the same path consistently at different input frame rates', () => {
    function trace(frameRate: number) {
      const wake = createBallWake(SIZE, SIZE);
      for (let frame = 0; frame <= frameRate; frame++) {
        moveBallWake(wake, 50 + 150 * frame / frameRate, 150, 1000 * frame / frameRate);
      }
      return wake.field.current;
    }
    const slow = trace(60);
    const fast = trace(144);
    for (const [index, value] of slow.entries()) expect(value).toBeCloseTo(fast[index]!, 5);
  });

  it('does not build up waves from a stationary ball or a silent source', () => {
    const wake = createBallWake(SIZE, SIZE);
    moveBallWake(wake, 100, 100, 0);
    const initial = [...wake.field.current];
    moveBallWake(wake, 100, 100, 100);
    moveBallWake(wake, 150, 100, 200, 0);
    expect([...wake.field.current]).toEqual(initial);
  });

  it('starts a fresh segment after a serve without drawing across the jump', () => {
    const wake = createBallWake(SIZE, SIZE);
    moveBallWake(wake, 20, 100, 0);
    moveBallWake(wake, 50, 100, 100);
    endBallWake(wake);
    moveBallWake(wake, 250, 100, 200);
    const row = Math.round(100 * wake.field.height / SIZE);
    for (let column = 25; column <= 70; column++) {
      expect(wake.field.current[row * wake.field.width + column]).toBe(0);
    }
  });

  it('keeps a stopped wake visible beyond the pointer settling time and clears at its own timeout', () => {
    const wake = createBallWake(SIZE, SIZE);
    moveBallWake(wake, 150, 150, 0);
    endBallWake(wake);
    for (let frame = 1; frame <= 168; frame++) advanceBallWake(wake, frame * 1000 / 60);
    expect(peak(shade(wake, 2800))).toBeGreaterThan(0);
    expect(hasBallWake(wake, 2800)).toBe(true);
    advanceBallWake(wake, BALL_WAKE_CONFIG.lifetimeMs);
    expect(peak(shade(wake, BALL_WAKE_CONFIG.lifetimeMs))).toBe(0);
    expect(wake.field.current.every(value => value === 0)).toBe(true);
    expect(wake.field.previous.every(value => value === 0)).toBe(true);
    expect(hasBallWake(wake, BALL_WAKE_CONFIG.lifetimeMs)).toBe(false);
  });

  it('bounds simulation work and remains finite during long fast rallies', () => {
    const wake = createBallWake(7680, 4320);
    expect(wake.field.current.length).toBeLessThanOrEqual(RIPPLE_MAX_CELLS);
    const bounded = createBallWake(SIZE, SIZE);
    for (let frame = 0; frame < 300; frame++) {
      moveBallWake(bounded, 150 + 120 * Math.sin(frame / 8), 150, frame * 1000 / 60);
      advanceBallWake(bounded, frame * 1000 / 60);
    }
    expect(bounded.field.current.every(Number.isFinite)).toBe(true);
    expect(peak(shade(bounded, 5000))).toBeGreaterThan(0);
  });

  it('adds expanding impact ripples on the same ball water surface', () => {
    const wake = createBallWake(SIZE, SIZE);
    disturbBallWake(wake, 150, 150, 0, 1);
    advanceBallWake(wake, 16);
    expect(peak(shade(wake, 16))).toBeGreaterThan(0);
    expect(hasBallWake(wake, 16)).toBe(true);
  });

  it('respects source strength and opacity without erasing another source', () => {
    const full = createBallWake(SIZE, SIZE);
    const faint = createBallWake(SIZE, SIZE);
    moveBallWake(full, 150, 150, 0, 1);
    moveBallWake(faint, 150, 150, 0, 0.25);
    expect(peak(shade(faint, 0))).toBeLessThan(peak(shade(full, 0)));
    expect(peak(shade(full, 0))).toBeLessThanOrEqual(MAX_ALPHA * BALL_WAKE_CONFIG.opacity);
    const pixels = new Uint8ClampedArray(full.field.width * full.field.height * 4).fill(100);
    shadeBallWake(full, pixels, 0, MAX_ALPHA);
    expect(pixels.every(value => value === 100)).toBe(true);
  });
});
