import type { BallState } from './pong';

export const BALL_EMPHASIS_REASON = Object.freeze({
  HIDDEN: 'hidden',
  IMPACT: 'impact',
  UNLOCKED: 'unlocked',
} as const);

export type BallEmphasisReason =
  (typeof BALL_EMPHASIS_REASON)[keyof typeof BALL_EMPHASIS_REASON];

export interface BallEmphasis {
  opacity: number;
  reason: BallEmphasisReason;
  scale: number;
}

export const PONG_FOREGROUND_OPACITY = 0.2;

const BALL_IMPACT_DECAY_SECONDS = 0.3;
const BALL_IMPACT_OPACITY = 0.32;
const BALL_IMPACT_SCALE_INCREASE = 0.22;
const BALL_UNLOCKED_SCALE = 1.08;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function velocityReversed(previous: number, next: number): boolean {
  return previous !== 0 && next !== 0 && Math.sign(previous) !== Math.sign(next);
}

export function ballHadImpact(previous: BallState, next: BallState): boolean {
  return ballHadPaddleImpact(previous, next) || velocityReversed(previous.vy, next.vy);
}

export function ballHadPaddleImpact(previous: BallState, next: BallState): boolean {
  return velocityReversed(previous.vx, next.vx);
}

export function decayBallImpact(intensity: number, seconds: number): number {
  const normalized = clampUnit(intensity);
  if (!Number.isFinite(seconds) || seconds <= 0) return normalized;
  return Math.max(0, normalized - seconds / BALL_IMPACT_DECAY_SECONDS);
}

export function getBallEmphasis(unlocked: boolean, impactIntensity: number): BallEmphasis {
  const impact = clampUnit(impactIntensity);
  const impactOpacity = impact * BALL_IMPACT_OPACITY;
  const unlockedOpacity = unlocked ? PONG_FOREGROUND_OPACITY : 0;
  const opacity = Math.max(impactOpacity, unlockedOpacity);

  let reason: BallEmphasisReason = BALL_EMPHASIS_REASON.HIDDEN;
  if (opacity > 0) {
    reason = impactOpacity >= unlockedOpacity
      ? BALL_EMPHASIS_REASON.IMPACT
      : BALL_EMPHASIS_REASON.UNLOCKED;
  }

  return {
    opacity,
    reason,
    scale: Math.max(1 + impact * BALL_IMPACT_SCALE_INCREASE, unlocked ? BALL_UNLOCKED_SCALE : 1),
  };
}
