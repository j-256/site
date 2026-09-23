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
