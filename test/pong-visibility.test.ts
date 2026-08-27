import { describe, expect, it } from 'vitest';
import {
  BALL_EMPHASIS_REASON,
  PONG_FOREGROUND_OPACITY,
  ballHadImpact,
  ballHadPaddleImpact,
  decayBallImpact,
  getBallEmphasis,
} from '../src/lib/pong-visibility';

describe('Pong ball visibility', () => {
  it('detects wall and paddle impacts without treating a serve as an impact', () => {
    expect(ballHadImpact(
      { x: 0, y: 0, vx: 100, vy: 50 },
      { x: 0, y: 0, vx: -100, vy: 50 }
    )).toBe(true);
    expect(ballHadImpact(
      { x: 0, y: 0, vx: 100, vy: -50 },
      { x: 0, y: 0, vx: 100, vy: 50 }
    )).toBe(true);
    expect(ballHadImpact(
      { x: 0, y: 0, vx: 0, vy: 0 },
      { x: 0, y: 0, vx: 100, vy: 50 }
    )).toBe(false);
    expect(ballHadPaddleImpact(
      { x: 0, y: 0, vx: 100, vy: 50 },
      { x: 0, y: 0, vx: -100, vy: 50 }
    )).toBe(true);
    expect(ballHadPaddleImpact(
      { x: 0, y: 0, vx: 100, vy: -50 },
      { x: 0, y: 0, vx: 100, vy: 50 }
    )).toBe(false);
  });

  it('decays and clamps impact intensity', () => {
    expect(decayBallImpact(1, 0.1)).toBeGreaterThan(0);
    expect(decayBallImpact(1, 1)).toBe(0);
    expect(decayBallImpact(2, 0)).toBe(1);
    expect(decayBallImpact(Number.NaN, 0.1)).toBe(0);
  });

  it('keeps the overlay bright after it is unlocked', () => {
    const hidden = getBallEmphasis(false, 0);
    const unlocked = getBallEmphasis(true, 0);
    const impact = getBallEmphasis(true, 1);

    expect(hidden).toEqual({
      opacity: 0,
      reason: BALL_EMPHASIS_REASON.HIDDEN,
      scale: 1,
    });
    expect(unlocked.reason).toBe(BALL_EMPHASIS_REASON.UNLOCKED);
    expect(unlocked.opacity).toBe(PONG_FOREGROUND_OPACITY);
    expect(impact.reason).toBe(BALL_EMPHASIS_REASON.IMPACT);
    expect(impact.opacity).toBeGreaterThan(unlocked.opacity);
    expect(impact.scale).toBeGreaterThan(unlocked.scale);
  });
});
