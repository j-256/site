export interface RippleField {
  width: number;
  height: number;
  current: Float32Array;
  previous: Float32Array;
}

export const RIPPLE_CELL_SIZE = 3;
export const RIPPLE_MAX_CELLS = 180_000;
const MIN_DIMENSION = 3;
const DAMPING = 0.985;
const DROP_RADIUS = 3.5;
const DROP_STRENGTH = 2.5;
const MAX_HEIGHT = 16;
const BALL_PULSE_SPACING = 72;
const BALL_MIN_RADIUS = 4;
const BALL_MAX_RADIUS = 7;
const BALL_MIN_STRENGTH = 0.2;

export function createRippleField(width: number, height: number): RippleField {
  const cellSize = Math.max(RIPPLE_CELL_SIZE, Math.sqrt(width * height / RIPPLE_MAX_CELLS));
  const columns = Math.max(MIN_DIMENSION, Math.floor(width / cellSize));
  const rows = Math.max(MIN_DIMENSION, Math.floor(height / cellSize));
  return {
    width: columns,
    height: rows,
    current: new Float32Array(columns * rows),
    previous: new Float32Array(columns * rows),
  };
}

export function disturbRipple(field: RippleField, x: number, y: number, strength = 1, radius = DROP_RADIUS): void {
  if (strength <= 0) return;
  const left = Math.max(1, Math.floor(x - radius));
  const right = Math.min(field.width - 2, Math.ceil(x + radius));
  const top = Math.max(1, Math.floor(y - radius));
  const bottom = Math.min(field.height - 2, Math.ceil(y + radius));

  for (let row = top; row <= bottom; row++) {
    for (let column = left; column <= right; column++) {
      const distance = Math.hypot(column - x, row - y) / radius;
      if (distance >= 1) continue;
      const index = row * field.width + column;
      const drop = (1 + Math.cos(distance * Math.PI)) * DROP_STRENGTH * strength / 2;
      field.current[index] = Math.min(MAX_HEIGHT, field.current[index] + drop);
    }
  }
}

export function advanceRipples(field: RippleField, damping = DAMPING): void {
  const { width, height, current, previous } = field;
  for (let row = 1; row < height - 1; row++) {
    for (let column = 1; column < width - 1; column++) {
      const index = row * width + column;
      previous[index] = (
        (current[index - 1] + current[index + 1] + current[index - width] + current[index + width]) / 2
        - previous[index]
      ) * damping;
    }
  }
  field.current = previous;
  field.previous = current;
}

export function disturbBallRipple(field: RippleField, x: number, y: number, travel: number, strength = 1): void {
  // Vary the round footprint along the path to soften a perfectly coherent V-shaped wake
  const pulse = (1 + Math.cos(travel / BALL_PULSE_SPACING * Math.PI * 2)) / 2;
  disturbRipple(
    field, x, y,
    strength * (BALL_MIN_STRENGTH + (1 - BALL_MIN_STRENGTH) * pulse),
    BALL_MIN_RADIUS + (BALL_MAX_RADIUS - BALL_MIN_RADIUS) * pulse,
  );
}
