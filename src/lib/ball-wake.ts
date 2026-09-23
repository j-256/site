interface WakePoint {
  x: number;
  y: number;
  time: number;
}

interface WaveCrest extends WakePoint {
  headingX: number;
  headingY: number;
  travel: number;
  strength: number;
}

export interface BallWake {
  crests: WaveCrest[];
  previous: WakePoint | undefined;
  travel: number;
  nextCrest: number;
}

const CREST_SPACING = 8;
const BODY_RADIUS = 10;
const SPREAD_PER_SECOND = 75;
const CREST_WIDTH = 2;
const SOFTEN_PER_SECOND = 4;
const LIFETIME_MS = 1600;
const TRAIL_LENGTH = 360;
const MAX_CRESTS = Math.ceil(TRAIL_LENGTH / CREST_SPACING) + 2;
const PROFILE_EXTENT = 3;

export function createBallWake(): BallWake {
  return { crests: [], previous: undefined, travel: 0, nextCrest: 0 };
}

export function endBallWake(wake: BallWake): void {
  wake.previous = undefined;
  wake.nextCrest = 0;
}

export function moveBallWake(wake: BallWake, x: number, y: number, time: number, strength = 1): boolean {
  if (strength <= 0) {
    endBallWake(wake);
    return false;
  }
  const previous = wake.previous;
  wake.previous = { x, y, time };
  if (!previous) return false;
  const dx = x - previous.x;
  const dy = y - previous.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return false;
  if (distance > TRAIL_LENGTH) {
    wake.nextCrest = 0;
    return false;
  }
  let along = wake.nextCrest;
  while (along <= distance) {
    const fraction = along / distance;
    wake.crests.push({
      x: previous.x + dx * fraction,
      y: previous.y + dy * fraction,
      time: previous.time + (time - previous.time) * fraction,
      headingX: dx / distance,
      headingY: dy / distance,
      travel: wake.travel + along,
      strength: Math.min(1, strength),
    });
    along += CREST_SPACING;
  }
  wake.travel += distance;
  wake.nextCrest = along - distance;
  if (wake.crests.length > MAX_CRESTS) wake.crests.splice(0, wake.crests.length - MAX_CRESTS);
  return true;
}

export function shadeBallWake(
  wake: BallWake,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  time: number,
  maxAlpha: number,
): void {
  wake.crests = wake.crests.filter(crest => time - crest.time < LIFETIME_MS && wake.travel - crest.travel < TRAIL_LENGTH);
  const scaleX = width / viewportWidth;
  const scaleY = height / viewportHeight;
  for (const crest of wake.crests) {
    const age = Math.max(0, time - crest.time);
    const seconds = age / 1000;
    const ageFraction = age / LIFETIME_MS;
    const distanceFraction = (wake.travel - crest.travel) / TRAIL_LENGTH;
    const fade = (1 - ageFraction ** 2) * (1 - distanceFraction ** 2) ** 2 * crest.strength;
    const radius = BODY_RADIUS + SPREAD_PER_SECOND * seconds;
    const softness = CREST_WIDTH + SOFTEN_PER_SECOND * seconds;
    const centerX = crest.x - crest.headingX * BODY_RADIUS;
    const centerY = crest.y - crest.headingY * BODY_RADIUS;
    const extent = radius + softness * PROFILE_EXTENT;
    const left = Math.max(1, Math.floor((centerX - extent) * scaleX));
    const right = Math.min(width - 2, Math.ceil((centerX + extent) * scaleX));
    const top = Math.max(1, Math.floor((centerY - extent) * scaleY));
    const bottom = Math.min(height - 2, Math.ceil((centerY + extent) * scaleY));
    for (let row = top; row <= bottom; row++) {
      for (let column = left; column <= right; column++) {
        const dx = column / scaleX - centerX;
        const dy = row / scaleY - centerY;
        const distance = Math.hypot(dx, dy);
        if (distance === 0) continue;
        const forward = (dx * crest.headingX + dy * crest.headingY) / distance;
        if (forward <= 0) continue;
        const offset = (distance - radius) / softness;
        const profile = Math.exp(-offset * offset / 2) * forward * Math.sqrt(forward);
        const index = (row * width + column) * 4 + 3;
        // Taper the ends of each crest instead of joining them into a bright V
        pixels[index] = Math.max(pixels[index]!, maxAlpha * fade * profile);
      }
    }
  }
}
