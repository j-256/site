export interface RipplePoint {
  x: number;
  y: number;
}

export interface PongRippleFrame {
  ownsSurface: boolean;
  ball: RipplePoint | null;
  impact: boolean;
}

type Listener = (frame: PongRippleFrame) => void;

const listeners = new Set<Listener>();
let latestFrame: PongRippleFrame = { ownsSurface: false, ball: null, impact: false };

export function publishPongRipples(frame: PongRippleFrame): void {
  latestFrame = frame;
  for (const listener of listeners) listener(frame);
}

export function subscribeToPongRipples(listener: Listener): () => void {
  listeners.add(listener);
  listener({ ...latestFrame, impact: false });
  return () => { listeners.delete(listener); };
}
