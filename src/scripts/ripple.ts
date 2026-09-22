import {
  ANIMATION_MEDIA_QUERY,
  ANIMATION_MODE_ATTRIBUTE,
  motionShouldReduce,
} from '../lib/animation-preference';
import { advanceRipples, createRippleField, disturbRipple, type RippleField } from '../lib/ripple';
import { subscribeToPongRipples, type PongRippleFrame, type RipplePoint } from './pong-ripples';

const FRAME_MS = 1000 / 60;
const MAX_FRAME_STEPS = 3;
const TRAIL_SPACING = 10;
const MAX_TRAIL_STEPS = 32;
const MIN_TRAVEL = 3;
const POINTER_DAMPING = 0.965;
const POINTER_SETTLE_MS = 2500;
const POINTER_FADE_MS = 1200;
const BALL_SETTLE_MS = 5000;
const BALL_FADE_MS = 1500;
const RIPPLE_GRAY = 145;
const MAX_ALPHA = 60;
const LIGHT_STRENGTH = 48;
const HANDOFF_MS = 1000;
const BALL_WAKE_STRENGTH = 0.45;
const BALL_WAKE_SPACING = 32;
const BALL_CELL_SIZE = 6;
const BALL_DROP_RADIUS = 2.5;
const BALL_WAVE_SPEED_RATIO = 1.35;
const BALL_IMPACT_STRENGTH = 0.55;
const MAX_SURFACE_PIXEL_RATIO = 2;
const RIPPLE_SOURCE = Object.freeze({ POINTER: 'pointer', PONG: 'pong' } as const);

export function initRippleBackground(canvas: HTMLCanvasElement): () => void {
  const context = canvas.getContext('2d');
  if (!context) return () => {};
  const ballCanvas = document.createElement('canvas');
  const ballContext = ballCanvas.getContext('2d');
  if (!ballContext) return () => {};
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
  let ballField = createRippleField(viewportWidth, viewportHeight, BALL_CELL_SIZE);
  let pixels: ImageData;
  let ballPixels: ImageData;
  let mouse: RipplePoint | undefined;
  let ball: RipplePoint | undefined;
  let ballTravel = 0;
  let ballStepsPerFrame = 1;
  let ballStepsPending = 0;
  let lastPointerInput = Number.NEGATIVE_INFINITY;
  let lastBallInput = Number.NEGATIVE_INFINITY;
  let ballRipplesActive = false;
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
    ball = undefined;
    ballTravel = 0;
    ballStepsPending = 0;
    lastPointerInput = Number.NEGATIVE_INFINITY;
    lastBallInput = Number.NEGATIVE_INFINITY;
    ballRipplesActive = false;
    touches.clear();
    field.current.fill(0);
    field.previous.fill(0);
    ballField.current.fill(0);
    ballField.previous.fill(0);
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
    ballField = createRippleField(viewportWidth, viewportHeight, BALL_CELL_SIZE);
    canvas.width = field.width;
    canvas.height = field.height;
    pixels = context!.createImageData(field.width, field.height);
    ballCanvas.width = ballField.width;
    ballCanvas.height = ballField.height;
    ballPixels = ballContext!.createImageData(ballField.width, ballField.height);
    for (const image of [pixels, ballPixels]) {
      for (let index = 0; index < image.data.length; index += 4) {
        image.data[index] = RIPPLE_GRAY;
        image.data[index + 1] = RIPPLE_GRAY;
        image.data[index + 2] = RIPPLE_GRAY;
      }
    }
  }

  function shade(surface: RippleField, image: ImageData, fade: number): void {
    const { current, width, height } = surface;
    for (let row = 1; row < height - 1; row++) {
      for (let column = 1; column < width - 1; column++) {
        const index = row * width + column;
        const slope = current[index - 1] - current[index + 1]
          + current[index - width] - current[index + width];
        const intensity = Math.abs(slope) * LIGHT_STRENGTH;
        image.data[index * 4 + 3] = MAX_ALPHA * intensity / (MAX_ALPHA + intensity) * fade;
      }
    }
  }

  function draw(fade: number, ballFade: number): void {
    shade(field, pixels, fade);
    context!.putImageData(pixels, 0, 0);
    if (ballRipplesActive) {
      shade(ballField, ballPixels, ballFade);
      ballContext!.putImageData(ballPixels, 0, 0);
      context!.drawImage(ballCanvas, 0, 0, canvas.width, canvas.height);
    }
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
    const pointerIdleTime = now - lastPointerInput;
    const ballIdleTime = now - lastBallInput;
    if (document.hidden || motionShouldReduce(reducedMotion)
      || (pointerIdleTime >= POINTER_SETTLE_MS && ballIdleTime >= BALL_SETTLE_MS)) {
      reset();
      return;
    }
    accumulatedTime += Math.min(now - lastFrame, FRAME_MS * MAX_FRAME_STEPS);
    lastFrame = now;
    if (pointerIdleTime >= POINTER_SETTLE_MS && Number.isFinite(lastPointerInput)) {
      field.current.fill(0);
      field.previous.fill(0);
      lastPointerInput = Number.NEGATIVE_INFINITY;
    }
    if (ballRipplesActive && ballIdleTime >= BALL_SETTLE_MS) {
      ballField.current.fill(0);
      ballField.previous.fill(0);
      ballRipplesActive = false;
      ballStepsPending = 0;
    }
    if (accumulatedTime >= FRAME_MS) {
      while (accumulatedTime >= FRAME_MS) {
        if (pointerIdleTime < POINTER_SETTLE_MS) advanceRipples(field, POINTER_DAMPING);
        if (ballRipplesActive) {
          ballStepsPending += ballStepsPerFrame;
          while (ballStepsPending >= 1) {
            advanceRipples(ballField);
            ballStepsPending--;
          }
        }
        accumulatedTime -= FRAME_MS;
      }
      draw(
        Math.max(0, Math.min(1, (POINTER_SETTLE_MS - pointerIdleTime) / POINTER_FADE_MS)),
        Math.max(0, Math.min(1, (BALL_SETTLE_MS - ballIdleTime) / BALL_FADE_MS)),
      );
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

  function disturb(point: RipplePoint, strength: number, surface = field, radius?: number): void {
    disturbRipple(
      surface,
      point.x * surface.width / viewportWidth,
      point.y * surface.height / viewportHeight,
      strength,
      radius,
    );
    if (surface === ballField && strength > 0) {
      lastBallInput = performance.now();
      ballRipplesActive = true;
    } else if (strength > 0) {
      lastPointerInput = performance.now();
    }
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
      ball = undefined;
      ballTravel = 0;
      return;
    }
    // Let circular waves spread past the ball instead of collapsing into a sharp wake
    const cellSize = Math.min(viewportWidth / ballField.width, viewportHeight / ballField.height);
    const waveSpeed = cellSize * Math.SQRT1_2 * 1000 / FRAME_MS;
    ballStepsPerFrame = Math.max(1, snapshot.ball.speed * BALL_WAVE_SPEED_RATIO / waveSpeed);
    if (ball) {
      const distance = Math.hypot(snapshot.ball.x - ball.x, snapshot.ball.y - ball.y);
      for (let travel = BALL_WAKE_SPACING - ballTravel; travel <= distance; travel += BALL_WAKE_SPACING) {
        const fraction = travel / distance;
        disturb({
          x: ball.x + (snapshot.ball.x - ball.x) * fraction,
          y: ball.y + (snapshot.ball.y - ball.y) * fraction,
        }, BALL_WAKE_STRENGTH * pongWeight(), ballField, BALL_DROP_RADIUS);
        wake();
      }
      ballTravel = (ballTravel + distance) % BALL_WAKE_SPACING;
    }
    ball = snapshot.ball;
    if (snapshot.impact) {
      disturb(snapshot.ball, BALL_IMPACT_STRENGTH, ballField, BALL_DROP_RADIUS);
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
