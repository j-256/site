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

export const PONG_BRIGHTNESS_OPACITIES = Object.freeze([0, 0.2, 0.4, 0.6, 0.8]);
export const PONG_BRIGHTNESS_MAX_STAGE = PONG_BRIGHTNESS_OPACITIES.length - 1;

const BALL_IMPACT_DECAY_SECONDS = 0.3;
const BALL_IMPACT_OPACITY_INCREASE = 0.12;
const BALL_IMPACT_SCALE_INCREASE = 0.22;
const BALL_UNLOCKED_SCALE = 1.08;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function velocityReversed(previous: number, next: number): boolean {
  return previous !== 0 && next !== 0 && Math.sign(previous) !== Math.sign(next);
}

function normalizeBrightnessStage(stage: number): number {
  if (!Number.isFinite(stage)) return 0;
  return Math.min(Math.max(Math.floor(stage), 0), PONG_BRIGHTNESS_MAX_STAGE);
}

export function advancePongBrightnessStage(stage: number): number {
  return Math.min(normalizeBrightnessStage(stage) + 1, PONG_BRIGHTNESS_MAX_STAGE);
}

export function getPongBrightnessOpacity(stage: number): number {
  return PONG_BRIGHTNESS_OPACITIES[normalizeBrightnessStage(stage)];
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

export function getBallEmphasis(brightnessStage: number, impactIntensity: number): BallEmphasis {
  const impact = clampUnit(impactIntensity);
  const unlockedOpacity = getPongBrightnessOpacity(brightnessStage);
  const impactOpacity = unlockedOpacity > 0 ? impact * BALL_IMPACT_OPACITY_INCREASE : 0;
  const opacity = Math.min(unlockedOpacity + impactOpacity, 1);

  let reason: BallEmphasisReason = BALL_EMPHASIS_REASON.HIDDEN;
  if (impactOpacity > 0) reason = BALL_EMPHASIS_REASON.IMPACT;
  else if (unlockedOpacity > 0) reason = BALL_EMPHASIS_REASON.UNLOCKED;

  return {
    opacity,
    reason,
    scale: Math.max(
      1 + (unlockedOpacity > 0 ? impact : 0) * BALL_IMPACT_SCALE_INCREASE,
      unlockedOpacity > 0 ? BALL_UNLOCKED_SCALE : 1
    ),
  };
}
