import { describe, expect, it } from 'vitest';
import { createBallWake, endBallWake, moveBallWake, shadeBallWake, type BallWake } from '../src/lib/ball-wake';

const SIZE = 300;
const MAX_ALPHA = 60;

function shade(wake: BallWake, time: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(SIZE * SIZE * 4);
  shadeBallWake(wake, pixels, SIZE, SIZE, SIZE, SIZE, time, MAX_ALPHA);
  return pixels;
}

function peak(pixels: Uint8ClampedArray): number {
  return pixels.reduce((maximum, value, index) => index % 4 === 3 ? Math.max(maximum, value) : maximum, 0);
}

describe('Ball wake', () => {
  it('samples the same path consistently at different input frame rates', () => {
    function trace(frameRate: number): BallWake {
      const wake = createBallWake();
      for (let frame = 0; frame <= frameRate; frame++) {
        moveBallWake(wake, 100 + 350 * frame / frameRate, 150, 1000 * frame / frameRate);
      }
      return wake;
    }
    const slow = trace(60);
    const fast = trace(144);
    expect(slow.crests.length).toBe(fast.crests.length);
    for (const [index, crest] of slow.crests.entries()) {
      expect(crest.x).toBeCloseTo(fast.crests[index]!.x);
      expect(crest.time).toBeCloseTo(fast.crests[index]!.time);
      expect(crest.headingX).toBeCloseTo(fast.crests[index]!.headingX);
    }
  });

  it('does not emit waves from a stationary ball or a silent source', () => {
    const wake = createBallWake();
    moveBallWake(wake, 100, 100, 0);
    moveBallWake(wake, 100, 100, 100);
    moveBallWake(wake, 150, 100, 200, 0);
    expect(wake.crests).toEqual([]);
  });

  it('starts a fresh segment after a serve without drawing across the jump', () => {
    const wake = createBallWake();
    moveBallWake(wake, 20, 100, 0);
    moveBallWake(wake, 50, 100, 100);
    const previousCrests = [...wake.crests];
    endBallWake(wake);
    moveBallWake(wake, 250, 100, 200);
    expect(wake.crests).toEqual(previousCrests);
    moveBallWake(wake, 280, 100, 300);
    expect(wake.crests.filter(crest => crest.x > 50 && crest.x < 250)).toEqual([]);
  });

  it('keeps old wave headings when the ball reflects', () => {
    const wake = createBallWake();
    moveBallWake(wake, 100, 100, 0);
    moveBallWake(wake, 200, 100, 300);
    const countBeforeBounce = wake.crests.length;
    moveBallWake(wake, 150, 100, 450);
    expect(wake.crests.slice(0, countBeforeBounce).every(crest => crest.headingX === 1)).toBe(true);
    expect(wake.crests.slice(countBeforeBounce).every(crest => crest.headingX === -1)).toBe(true);
  });

  it('bounds the history during a long rally', () => {
    const wake = createBallWake();
    for (let frame = 0; frame < 1000; frame++) moveBallWake(wake, frame * 10, 100, frame * 16);
    const filledLength = wake.crests.length;
    for (let frame = 1000; frame < 10_000; frame++) moveBallWake(wake, frame * 10, 100, frame * 16);
    expect(wake.crests.length).toBe(filledLength);
  });

  it('curves the crests and tapers their sides symmetrically', () => {
    const wake = createBallWake();
    moveBallWake(wake, 100, 100, 0);
    moveBallWake(wake, 101, 100, 3);
    const pixels = shade(wake, 200);
    const alpha = (x: number, y: number) => pixels[(y * SIZE + x) * 4 + 3]!;
    expect(alpha(115, 100)).toBeGreaterThan(50);
    expect(alpha(112, 110)).toBeGreaterThan(alpha(115, 110));
    expect(alpha(112, 110)).toBe(alpha(112, 90));
    expect(alpha(90, 125)).toBe(0);
  });

  it('rotates the texture with the path without changing its brightness', () => {
    const horizontal = createBallWake();
    const vertical = createBallWake();
    moveBallWake(horizontal, 100, 100, 0);
    moveBallWake(horizontal, 101, 100, 3);
    moveBallWake(vertical, 100, 100, 0);
    moveBallWake(vertical, 100, 101, 3);
    const across = shade(horizontal, 200);
    const down = shade(vertical, 200);
    for (let row = 70; row < 135; row++) {
      for (let column = 70; column < 135; column++) {
        expect(across[(row * SIZE + column) * 4 + 3]).toBe(down[(column * SIZE + row) * 4 + 3]);
      }
    }
  });

  it('fades after stopping, respects the handoff, and clears expired waves', () => {
    const wake = createBallWake();
    moveBallWake(wake, 100, 100, 0, 0.5);
    moveBallWake(wake, 101, 100, 3, 0.5);
    const moving = peak(shade(wake, 50));
    expect(moving).toBeGreaterThan(20);
    expect(moving).toBeLessThanOrEqual(MAX_ALPHA / 2);
    expect(peak(shade(wake, 500))).toBeGreaterThan(moving * 0.7);
    expect(peak(shade(wake, 1500))).toBeLessThan(moving / 4);
    expect(peak(shade(wake, 1600))).toBe(0);
    expect(wake.crests).toEqual([]);
  });
});
