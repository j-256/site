import { describe, expect, it } from 'vitest';
import { advanceRipples, createRippleField, disturbRipple, RIPPLE_MAX_CELLS } from '../src/lib/ripple';

describe('Ripple field', () => {
  it('bounds simulation work on a high-resolution display', () => {
    const field = createRippleField(7680, 4320);
    expect(field.current.length).toBeLessThanOrEqual(RIPPLE_MAX_CELLS);
    expect(field.width / field.height).toBeCloseTo(7680 / 4320, 1);
  });

  it('stays still until disturbed', () => {
    const field = createRippleField(300, 180);
    advanceRipples(field);
    expect(field.current.every(value => value === 0)).toBe(true);
  });

  it('scales gentle disturbances without changing their shape', () => {
    const full = createRippleField(300, 180);
    const faint = createRippleField(300, 180);
    disturbRipple(full, 50, 30);
    disturbRipple(faint, 50, 30, 0.12);
    for (let index = 0; index < full.current.length; index++) {
      expect(faint.current[index]).toBeCloseTo(full.current[index] * 0.12);
    }
  });

  it('adds no disturbance when a source has faded out', () => {
    const field = createRippleField(300, 180);
    disturbRipple(field, 50, 30, 0);
    advanceRipples(field);
    expect(field.current.every(value => value === 0)).toBe(true);
  });

  it('propagates a disturbance beyond the initial drop and then dissipates', () => {
    const field = createRippleField(300, 180);
    const center = { x: field.width / 2, y: field.height / 2 };
    const distantIndex = center.y * field.width + center.x + 10;
    disturbRipple(field, center.x, center.y);
    expect(field.current[distantIndex]).toBe(0);
    for (let frame = 0; frame < 25; frame++) advanceRipples(field);
    expect(Math.abs(field.current[distantIndex])).toBeGreaterThan(0.01);
    const peak = Math.max(...field.current.map(Math.abs));
    for (let frame = 0; frame < 600; frame++) advanceRipples(field);
    expect(Math.max(...field.current.map(Math.abs))).toBeLessThan(peak / 20);
  });

  it('can slow propagation without changing the default water simulation', () => {
    const normal = createRippleField(600, 360);
    const slow = createRippleField(600, 360);
    const x = normal.width / 2;
    const y = normal.height / 2;
    disturbRipple(normal, x, y);
    disturbRipple(slow, x, y);
    for (let frame = 0; frame < 30; frame++) {
      advanceRipples(normal, 0.985);
      advanceRipples(slow, 0.985, 0.35);
    }
    function extent(field: typeof normal): number {
      let radius = 0;
      for (let column = 1; column < field.width - 1; column++) {
        if (Math.abs(field.current[y * field.width + column]!) > 0.01) radius = Math.max(radius, Math.abs(column - x));
      }
      return radius;
    }
    expect(extent(slow)).toBeGreaterThan(3);
    expect(extent(slow)).toBeLessThan(extent(normal) * 0.7);
    expect(slow.current.every(Number.isFinite)).toBe(true);
  });

  it('propagates round waves through diagonal neighbors as well as cardinal neighbors', () => {
    const round = createRippleField(21, 21);
    const standard = createRippleField(21, 21);
    const center = 3 * round.width + 3;
    round.current[center] = 1;
    standard.current[center] = 1;
    advanceRipples(round, 1, 0.35, true);
    advanceRipples(standard, 1, 0.35);
    const diagonal = center + round.width + 1;
    expect(round.current[diagonal]).toBeGreaterThan(0);
    expect(standard.current[diagonal]).toBe(0);
    expect(round.current[center + round.width + 1]).toBe(round.current[center - round.width - 1]);
  });

  it('keeps repeated edge disturbances finite and the boundary calm', () => {
    const field = createRippleField(300, 180);
    for (let frame = 0; frame < 300; frame++) {
      disturbRipple(field, 0, 0);
      disturbRipple(field, field.width - 1, field.height - 1);
      advanceRipples(field);
    }
    expect(field.current.every(Number.isFinite)).toBe(true);
    expect(field.current.slice(0, field.width).every(value => value === 0)).toBe(true);
    expect(field.current.slice(-field.width).every(value => value === 0)).toBe(true);
    expect(Math.max(...field.current.map(Math.abs))).toBeLessThan(100);
  });
});
