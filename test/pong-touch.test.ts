import { describe, expect, it } from 'vitest';
import {
  assignPaddleTouches,
  resolvePaddleTouches,
  type TouchPoint,
} from '../src/lib/pong-touch';

const COURT_WIDTH = 390;

describe('Pong touch controls', () => {
  it('assigns one of two touches to each half of the court', () => {
    const touches: TouchPoint[] = [
      { identifier: 7, x: 320, y: 450 },
      { identifier: 3, x: 40, y: 250 },
    ];

    expect(assignPaddleTouches(touches, COURT_WIDTH)).toEqual({ left: 3, right: 7 });
  });

  it('does not claim ordinary or ambiguous touch gestures', () => {
    expect(assignPaddleTouches([
      { identifier: 1, x: 40, y: 250 },
    ], COURT_WIDTH)).toBeNull();
    expect(assignPaddleTouches([
      { identifier: 1, x: 40, y: 250 },
      { identifier: 2, x: 120, y: 450 },
    ], COURT_WIDTH)).toBeNull();
    expect(assignPaddleTouches([
      { identifier: 1, x: 40, y: 250 },
      { identifier: 2, x: 350, y: 450 },
      { identifier: 3, x: 200, y: 350 },
    ], COURT_WIDTH)).toBeNull();
  });

  it('keeps each finger bound to its original paddle after crossing the center', () => {
    const assignment = { left: 1, right: 2 };
    const crossed = resolvePaddleTouches([
      { identifier: 1, x: 300, y: 200 },
      { identifier: 2, x: 90, y: 500 },
    ], assignment);

    expect(crossed).toEqual({
      left: { identifier: 1, x: 300, y: 200 },
      right: { identifier: 2, x: 90, y: 500 },
    });
  });

  it('ends an assignment when either controlling finger is gone', () => {
    expect(resolvePaddleTouches([
      { identifier: 1, x: 40, y: 250 },
    ], { left: 1, right: 2 })).toBeNull();
  });
});
