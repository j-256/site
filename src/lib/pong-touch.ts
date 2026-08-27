export interface TouchPoint {
  identifier: number;
  x: number;
  y: number;
}

export interface PaddleTouchAssignment {
  left: number;
  right: number;
}

export interface PaddleTouchPoints {
  left: TouchPoint;
  right: TouchPoint;
}

const REQUIRED_PADDLE_TOUCHES = 2;

export function assignPaddleTouches(
  touches: readonly TouchPoint[],
  courtWidth: number
): PaddleTouchAssignment | null {
  if (
    touches.length !== REQUIRED_PADDLE_TOUCHES ||
    !Number.isFinite(courtWidth) ||
    courtWidth <= 0
  ) return null;

  const center = courtWidth / 2;
  const left = touches.find(touch => touch.x < center);
  const right = touches.find(touch => touch.x >= center);
  if (!left || !right) return null;

  return {
    left: left.identifier,
    right: right.identifier,
  };
}

export function resolvePaddleTouches(
  touches: readonly TouchPoint[],
  assignment: PaddleTouchAssignment
): PaddleTouchPoints | null {
  const left = touches.find(touch => touch.identifier === assignment.left);
  const right = touches.find(touch => touch.identifier === assignment.right);
  if (!left || !right) return null;
  return { left, right };
}
