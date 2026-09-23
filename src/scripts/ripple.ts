import {
  ANIMATION_MEDIA_QUERY,
  ANIMATION_MODE_ATTRIBUTE,
  motionShouldReduce,
} from '../lib/animation-preference';
import { createBallWake, endBallWake, moveBallWake, shadeBallWake } from '../lib/ball-wake';
import { advanceRipples, createRippleField, disturbRipple } from '../lib/ripple';
import { subscribeToPongRipples, type PongRippleFrame, type RipplePoint } from './pong-ripples';

const FRAME_MS = 1000 / 60;
const MAX_FRAME_STEPS = 3;
const TRAIL_SPACING = 10;
const MAX_TRAIL_STEPS = 32;
const MIN_TRAVEL = 3;
const RIPPLE_DAMPING = 0.965;
const SETTLE_MS = 2500;
const FADE_MS = 1200;
const RIPPLE_GRAY = 145;
const MAX_ALPHA = 60;
const LIGHT_STRENGTH = 48;
const HANDOFF_MS = 1000;
const BALL_IMPACT_STRENGTH = 1.1;
const MAX_SURFACE_PIXEL_RATIO = 2;
const RIPPLE_SOURCE = Object.freeze({ POINTER: 'pointer', PONG: 'pong' } as const);

export function initRippleBackground(canvas: HTMLCanvasElement): () => void {
  const context = canvas.getContext('2d');
  if (!context) return () => {};
  const surfaces = Array.from(document.querySelectorAll<HTMLCanvasElement>('[data-ripple-surface]')).flatMap(surface => {
    const surfaceContext = surface.getContext('2d');
    return surfaceContext ? [{ canvas: surface, context: surfaceContext }] : [];
  });
  const reducedMotion = window.matchMedia(ANIMATION_MEDIA_QUERY);
  const controller = new AbortController();
  const passiveOptions = { passive: true, signal: controller.signal };
  let viewportWidth = window.innerWidth;
  let viewportHeight = window.innerHeight;
  let field = createRippleField(viewportWidth, viewportHeight);
  let pixels: ImageData;
  let mouse: RipplePoint | undefined;
  let ballWake = createBallWake();
  let lastInput = Number.NEGATIVE_INFINITY;
  const touches = new Map<number, RipplePoint>();
  let handoffFrom = 0;
  let handoffTarget = 0;
  let handoffStartedAt = 0;
  let animationFrame = 0;
  let lastFrame = 0;
  let accumulatedTime = 0;

  function reset(): void {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    accumulatedTime = 0;
    mouse = undefined;
    ballWake = createBallWake();
    lastInput = Number.NEGATIVE_INFINITY;
    touches.clear();
    field.current.fill(0);
    field.previous.fill(0);
    context!.clearRect(0, 0, canvas.width, canvas.height);
    for (const surface of surfaces) {
      surface.context.clearRect(0, 0, surface.canvas.width, surface.canvas.height);
    }
  }

  function resize(): void {
    reset();
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    field = createRippleField(viewportWidth, viewportHeight);
    canvas.width = field.width;
    canvas.height = field.height;
    pixels = context!.createImageData(field.width, field.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      pixels.data[index] = RIPPLE_GRAY;
      pixels.data[index + 1] = RIPPLE_GRAY;
      pixels.data[index + 2] = RIPPLE_GRAY;
    }
  }

  function draw(fade: number, now: number): void {
    const { current, width, height } = field;
    for (let row = 1; row < height - 1; row++) {
      for (let column = 1; column < width - 1; column++) {
        const index = row * width + column;
        const slope = current[index - 1] - current[index + 1]
          + current[index - width] - current[index + width];
        const intensity = Math.abs(slope) * LIGHT_STRENGTH;
        pixels.data[index * 4 + 3] = MAX_ALPHA * intensity / (MAX_ALPHA + intensity) * fade;
      }
    }
    shadeBallWake(ballWake, pixels.data, width, height, viewportWidth, viewportHeight, now, MAX_ALPHA * fade);
    context!.putImageData(pixels, 0, 0);
    drawSurfaces();
  }

  function drawSurfaces(): void {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_SURFACE_PIXEL_RATIO);
    for (const surface of surfaces) {
      const rect = surface.canvas.getBoundingClientRect();
      const width = Math.round(rect.width * pixelRatio);
      const height = Math.round(rect.height * pixelRatio);
      if (width === 0 || height === 0) continue;
      if (surface.canvas.width !== width) surface.canvas.width = width;
      if (surface.canvas.height !== height) surface.canvas.height = height;
      surface.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      surface.context.clearRect(0, 0, rect.width, rect.height);
      // Keep the water above the sticky header's backing and below its text
      surface.context.drawImage(canvas, -rect.left, -rect.top, viewportWidth, viewportHeight);
    }
  }

  function frame(now: number): void {
    animationFrame = 0;
    const idleTime = now - lastInput;
    if (document.hidden || motionShouldReduce(reducedMotion) || idleTime >= SETTLE_MS) {
      reset();
      return;
    }
    accumulatedTime += Math.min(now - lastFrame, FRAME_MS * MAX_FRAME_STEPS);
    lastFrame = now;
    if (accumulatedTime >= FRAME_MS) {
      while (accumulatedTime >= FRAME_MS) {
        advanceRipples(field, RIPPLE_DAMPING);
        accumulatedTime -= FRAME_MS;
      }
      draw(Math.max(0, Math.min(1, (SETTLE_MS - idleTime) / FADE_MS)), now);
    }
    animationFrame = window.requestAnimationFrame(frame);
  }

  function pongWeight(now = performance.now()): number {
    const progress = Math.min(1, (now - handoffStartedAt) / HANDOFF_MS);
    const eased = progress * progress * (3 - 2 * progress);
    return handoffFrom + (handoffTarget - handoffFrom) * eased;
  }

  function wake(): void {
    if (animationFrame === 0) {
      lastFrame = performance.now();
      animationFrame = window.requestAnimationFrame(frame);
    }
  }

  function disturb(point: RipplePoint, strength: number): void {
    const x = point.x * field.width / viewportWidth;
    const y = point.y * field.height / viewportHeight;
    disturbRipple(field, x, y, strength);
    if (strength > 0) lastInput = performance.now();
  }

  function trail(point: RipplePoint, previous: RipplePoint | undefined, strength: number): RipplePoint {
    if (document.hidden || motionShouldReduce(reducedMotion)) return point;
    if (strength <= 0) return point;
    const distance = previous ? Math.hypot(point.x - previous.x, point.y - previous.y) : 0;
    if (previous && distance < MIN_TRAVEL) return previous;
    const steps = Math.max(1, Math.min(MAX_TRAIL_STEPS, Math.ceil(distance / TRAIL_SPACING)));
    const start = previous ?? point;
    for (let step = 1; step <= steps; step++) {
      const fraction = step / steps;
      disturb({
        x: start.x + (point.x - start.x) * fraction,
        y: start.y + (point.y - start.y) * fraction,
      }, strength);
    }
    wake();
    return point;
  }

  function onPongFrame(snapshot: PongRippleFrame): void {
    const target = Number(snapshot.ownsSurface);
    if (target !== handoffTarget) {
      const now = performance.now();
      handoffFrom = pongWeight(now);
      handoffTarget = target;
      handoffStartedAt = now;
      mouse = undefined;
      touches.clear();
      canvas.dataset.rippleSource = target ? RIPPLE_SOURCE.PONG : RIPPLE_SOURCE.POINTER;
    }
    if (!snapshot.ball || !snapshot.ownsSurface || document.hidden || motionShouldReduce(reducedMotion)) {
      endBallWake(ballWake);
      return;
    }
    const now = performance.now();
    if (moveBallWake(ballWake, snapshot.ball.x, snapshot.ball.y, now, pongWeight(now))) {
      lastInput = now;
      wake();
    }
    if (snapshot.impact) {
      disturb(snapshot.ball, BALL_IMPACT_STRENGTH);
      wake();
    }
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerType === 'touch') return;
    mouse = trail({ x: event.clientX, y: event.clientY }, mouse, 1 - pongWeight());
  }

  function onTouch(event: TouchEvent): void {
    for (const touch of Array.from(event.changedTouches)) {
      touches.set(touch.identifier, trail(
        { x: touch.clientX, y: touch.clientY },
        touches.get(touch.identifier),
        1 - pongWeight(),
      ));
    }
  }

  function onTouchEnd(event: TouchEvent): void {
    for (const touch of Array.from(event.changedTouches)) touches.delete(touch.identifier);
  }

  function onMotionChange(): void {
    if (motionShouldReduce(reducedMotion)) reset();
  }

  const preferenceObserver = new MutationObserver(onMotionChange);
  preferenceObserver.observe(document.documentElement, { attributes: true, attributeFilter: [ANIMATION_MODE_ATTRIBUTE] });
  reducedMotion.addEventListener('change', onMotionChange);
  window.addEventListener('resize', resize, passiveOptions);
  window.addEventListener('scroll', drawSurfaces, passiveOptions);
  window.addEventListener('blur', reset, passiveOptions);
  window.addEventListener('pagehide', reset, passiveOptions);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) reset();
  }, passiveOptions);
  document.addEventListener('pointermove', onPointerMove, passiveOptions);
  document.addEventListener('pointerout', event => {
    if (event.relatedTarget === null) mouse = undefined;
  }, passiveOptions);
  document.addEventListener('touchstart', onTouch, passiveOptions);
  document.addEventListener('touchmove', onTouch, passiveOptions);
  document.addEventListener('touchend', onTouchEnd, passiveOptions);
  document.addEventListener('touchcancel', onTouchEnd, passiveOptions);
  resize();
  const unsubscribePong = subscribeToPongRipples(onPongFrame);

  return () => {
    unsubscribePong();
    reset();
    preferenceObserver.disconnect();
    reducedMotion.removeEventListener('change', onMotionChange);
    controller.abort();
  };
}
