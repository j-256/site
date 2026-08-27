import { describe, expect, it } from 'vitest';
import {
  BALL_EMPHASIS_REASON,
  PONG_BRIGHTNESS_MAX_STAGE,
  advancePongBrightnessStage,
  ballHadImpact,
  ballHadPaddleImpact,
  decayBallImpact,
  getBallEmphasis,
  getPongBrightnessOpacity,
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

  it('advances through four permanent brightness stages and then saturates', () => {
    let stage = 0;
    const opacities = [getPongBrightnessOpacity(stage)];
    for (let hit = 0; hit < PONG_BRIGHTNESS_MAX_STAGE + 1; hit++) {
      stage = advancePongBrightnessStage(stage);
      opacities.push(getPongBrightnessOpacity(stage));
    }

    expect(opacities).toEqual([0, 0.2, 0.4, 0.6, 0.8, 0.8]);
    expect(stage).toBe(PONG_BRIGHTNESS_MAX_STAGE);
    expect(getPongBrightnessOpacity(-1)).toBe(0);
    expect(getPongBrightnessOpacity(Number.NaN)).toBe(0);
  });

  it('keeps each stage visible beneath the temporary impact emphasis', () => {
    const hidden = getBallEmphasis(0, 1);
    const firstStage = getBallEmphasis(1, 0);
    const firstImpact = getBallEmphasis(1, 1);
    const finalStage = getBallEmphasis(PONG_BRIGHTNESS_MAX_STAGE, 0);
    const finalImpact = getBallEmphasis(PONG_BRIGHTNESS_MAX_STAGE, 1);

    expect(hidden).toEqual({
      opacity: 0,
      reason: BALL_EMPHASIS_REASON.HIDDEN,
      scale: 1,
    });
    expect(firstStage.reason).toBe(BALL_EMPHASIS_REASON.UNLOCKED);
    expect(firstStage.opacity).toBe(0.2);
    expect(firstImpact.reason).toBe(BALL_EMPHASIS_REASON.IMPACT);
    expect(firstImpact.opacity).toBeCloseTo(0.32);
    expect(firstImpact.scale).toBeGreaterThan(firstStage.scale);
    expect(finalStage.opacity).toBe(0.8);
    expect(finalImpact.opacity).toBeCloseTo(0.92);
    expect(finalImpact.opacity).toBeGreaterThan(finalStage.opacity);
  });
});
