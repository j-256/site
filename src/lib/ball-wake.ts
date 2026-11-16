import { advanceRipples, createRippleField, disturbRipple, type RippleField } from './ripple';

interface WakePoint {
  x: number;
  y: number;
}

export interface BallWake {
  field: RippleField;
  viewportWidth: number;
  viewportHeight: number;
  previous: WakePoint | undefined;
  nextDrop: number;
  lastInput: number;
}

export const BALL_WAKE_CONFIG = Object.freeze({
  lifetimeMs: 3600,
  fadeMs: 1200,
  waveSpeed: 1,
  damping: 0.985,
  trailSpacingPx: 10,
  disturbanceRadiusPx: 12,
  strength: 0.6,
  opacity: 1,
});

const MAX_TRAIL_STEPS = 32;
const LIGHT_STRENGTH = 48;

export function createBallWake(viewportWidth: number, viewportHeight: number): BallWake {
  return {
    field: createRippleField(viewportWidth, viewportHeight),
    viewportWidth,
    viewportHeight,
    previous: undefined,
    nextDrop: 0,
    lastInput: Number.NEGATIVE_INFINITY,
  };
}

export function endBallWake(wake: BallWake): void {
  wake.previous = undefined;
  wake.nextDrop = 0;
}

export function hasBallWake(wake: BallWake, time: number): boolean {
  return time - wake.lastInput < BALL_WAKE_CONFIG.lifetimeMs;
}

export function disturbBallWake(wake: BallWake, x: number, y: number, time: number, strength: number): void {
  if (strength <= 0) return;
  const scaleX = wake.field.width / wake.viewportWidth;
  const scaleY = wake.field.height / wake.viewportHeight;
  disturbRipple(wake.field, x * scaleX, y * scaleY, strength * BALL_WAKE_CONFIG.strength, BALL_WAKE_CONFIG.disturbanceRadiusPx * scaleX);
  wake.lastInput = time;
}

export function moveBallWake(wake: BallWake, x: number, y: number, time: number, strength = 1): boolean {
  if (strength <= 0) {
    endBallWake(wake);
    return false;
  }
  const previous = wake.previous;
  wake.previous = { x, y };
  if (!previous) {
    disturbBallWake(wake, x, y, time, strength);
    wake.nextDrop = BALL_WAKE_CONFIG.trailSpacingPx;
    return true;
  }
  const dx = x - previous.x;
  const dy = y - previous.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return false;
  if (distance > BALL_WAKE_CONFIG.trailSpacingPx * MAX_TRAIL_STEPS) {
    endBallWake(wake);
    return false;
  }
  let along = wake.nextDrop;
  while (along <= distance) {
    const fraction = along / distance;
    disturbBallWake(wake, previous.x + dx * fraction, previous.y + dy * fraction, time, strength);
    along += BALL_WAKE_CONFIG.trailSpacingPx;
  }
  wake.nextDrop = along - distance;
  wake.lastInput = time;
  return true;
}

export function advanceBallWake(wake: BallWake, time: number): void {
  if (!hasBallWake(wake, time)) {
    wake.field.current.fill(0);
    wake.field.previous.fill(0);
    return;
  }
  advanceRipples(wake.field, BALL_WAKE_CONFIG.damping, BALL_WAKE_CONFIG.waveSpeed, true);
}

export function shadeBallWake(wake: BallWake, pixels: Uint8ClampedArray, time: number, maxAlpha: number): void {
  if (!hasBallWake(wake, time)) return;
  const { current, width, height } = wake.field;
  const remaining = BALL_WAKE_CONFIG.lifetimeMs - (time - wake.lastInput);
  const fade = Math.min(1, remaining / BALL_WAKE_CONFIG.fadeMs) * BALL_WAKE_CONFIG.opacity;
  for (let row = 1; row < height - 1; row++) {
    for (let column = 1; column < width - 1; column++) {
      const index = row * width + column;
      const slopeX = current[index - 1]! - current[index + 1]!;
      const slopeY = current[index - width]! - current[index + width]!;
      const intensity = Math.hypot(slopeX, slopeY) * LIGHT_STRENGTH;
      const alpha = maxAlpha * intensity / (maxAlpha + intensity) * fade;
      pixels[index * 4 + 3] = Math.max(pixels[index * 4 + 3]!, alpha);
    }
  }
}
