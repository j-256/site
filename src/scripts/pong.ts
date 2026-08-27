import {
  PADDLE_SIDE,
  advancePong,
  createPongState,
  getCourtGeometry,
  resizePongState,
  setPaddleCenter,
  type CourtGeometry,
  type CourtSize,
  type PongState,
  type ServeDirection,
} from '../lib/pong';
import {
  ANIMATION_MEDIA_QUERY,
  motionShouldReduce,
} from '../lib/animation-preference';
import {
  ballHadImpact,
  ballHadPaddleImpact,
  decayBallImpact,
  getBallEmphasis,
  PONG_FOREGROUND_OPACITY,
} from '../lib/pong-visibility';

const CANVAS_STATE = Object.freeze({
  IDLE: 'idle',
  ACTIVE: 'active',
  DISMISSED: 'dismissed',
  PAUSED: 'paused',
  REDUCED_MOTION: 'reduced-motion',
  SLEEPING: 'sleeping',
} as const);
const BALL_PRESENCE = Object.freeze({
  DORMANT: 'dormant',
  SPAWNED: 'spawned',
} as const);
const BALL_REVEAL_STATE = Object.freeze({
  LOCKED: 'locked',
  UNLOCKED: 'unlocked',
} as const);
const PADDLE_TONE = Object.freeze({
  DIM: 'dim',
  BRIGHT: 'bright',
} as const);
const CONTROL_CODE = Object.freeze({
  LEFT_UP: 'KeyW',
  LEFT_DOWN: 'KeyS',
  RIGHT_UP: 'ArrowUp',
  RIGHT_DOWN: 'ArrowDown',
  TOGGLE_PAUSE: 'KeyP',
  DISMISS: 'Escape',
} as const);
const GAMEPLAY_CODES: ReadonlySet<string> = new Set([
  CONTROL_CODE.LEFT_UP,
  CONTROL_CODE.LEFT_DOWN,
  CONTROL_CODE.RIGHT_UP,
  CONTROL_CODE.RIGHT_DOWN,
]);
const ARROW_CODES: ReadonlySet<string> = new Set([CONTROL_CODE.RIGHT_UP, CONTROL_CODE.RIGHT_DOWN]);
const FALLBACK_GAME_COLOR = '#23AD19';
const FALLBACK_BALL_COLOR = '#29FE13';
const MAX_DEVICE_PIXEL_RATIO = 2;
const DISCOVERY_ACTIVATION_DURATION_MS = 1500;
const DISCOVERY_ACTIVITY_MAX_GAP_MS = 250;
const DISCOVERY_MIN_TRAVEL = 24;
const INACTIVITY_HIDE_DELAY_MS = 8000;
const BALL_DRAW_SCALE = 1.18;
const BALL_OCCLUDER_SELECTOR = [
  '.page a',
  '.page figcaption',
  '.page h1',
  '.page h2',
  '.page h3',
  '.page li',
  '.page p',
  '.page pre',
].join(',');
const BALL_OCCLUSION_SAMPLES = Object.freeze([
  Object.freeze({ x: 0, y: 0 }),
  Object.freeze({ x: -0.8, y: 0 }),
  Object.freeze({ x: 0.8, y: 0 }),
  Object.freeze({ x: 0, y: -0.8 }),
  Object.freeze({ x: 0, y: 0.8 }),
]);
const CENTER_LINE_DASH = 12;
const CENTER_LINE_GAP = 16;
const EMPTY_SCORE = '0:0';
const SCORE_COMMAND = 'pong';
const SCORE_TYPE_RATE_MS = 24;
const MAX_FRAME_SECONDS = 0.1;

interface Point {
  x: number;
  y: number;
}

interface PaddleEmphasisElements {
  left: HTMLElement;
  right: HTMLElement;
}

function viewportSize(): CourtSize {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function initialServeDirection(): ServeDirection {
  return Math.random() < 0.5 ? -1 : 1;
}

function isKeyboardGameContext(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || active === document.documentElement;
}

export function initPongBackground(
  canvas: HTMLCanvasElement,
  ballEmphasis: HTMLElement,
  paddleEmphasis: PaddleEmphasisElements,
  scoreTerminal: HTMLElement
): () => void {
  const drawingContext = canvas.getContext('2d');
  if (!drawingContext) return () => {};
  const context: CanvasRenderingContext2D = drawingContext;

  const reducedMotion = window.matchMedia(ANIMATION_MEDIA_QUERY);
  const abortController = new AbortController();
  const listenerOptions = { signal: abortController.signal };
  const passiveListenerOptions = { passive: true, signal: abortController.signal };
  const pressedCodes = new Set<string>();
  let court = viewportSize();
  let state: PongState = createPongState(court, initialServeDirection());
  let active = false;
  let dismissed = false;
  let paused = false;
  let sleeping = false;
  let animationFrame = 0;
  let lastFrameTime = 0;
  let previousMouse: Point | null = null;
  let previousTouches = new Map<number, Point>();
  let discoveryActivityStartedAt = 0;
  let lastDiscoveryMovementAt = 0;
  let discoveryTravel = 0;
  let lastGameActivityAt = 0;
  let inactivityTimer = 0;
  let gameColor = FALLBACK_GAME_COLOR;
  let ballColor = FALLBACK_BALL_COLOR;
  let ballImpact = 0;
  let ballVisibilityUnlocked = false;
  let scoreTerminalKey = '';
  let scoreTypingTimer = 0;

  function motionIsReduced(): boolean {
    return motionShouldReduce(reducedMotion);
  }

  function gameIsVisible(): boolean {
    return active && !dismissed && !sleeping;
  }

  function gameIsLit(): boolean {
    return gameIsVisible() && ballVisibilityUnlocked;
  }

  function resetDiscoveryActivity(): void {
    discoveryActivityStartedAt = 0;
    lastDiscoveryMovementAt = 0;
    discoveryTravel = 0;
  }

  function discoveryMovementIsSustained(distance: number, timestamp: number): boolean {
    if (!Number.isFinite(distance) || distance <= 0) return false;
    if (
      lastDiscoveryMovementAt === 0 ||
      timestamp - lastDiscoveryMovementAt > DISCOVERY_ACTIVITY_MAX_GAP_MS
    ) {
      discoveryActivityStartedAt = timestamp;
      discoveryTravel = 0;
    }
    lastDiscoveryMovementAt = timestamp;
    discoveryTravel += distance;
    return (
      discoveryTravel >= DISCOVERY_MIN_TRAVEL &&
      timestamp - discoveryActivityStartedAt >= DISCOVERY_ACTIVATION_DURATION_MS
    );
  }

  function stopInactivityTimer(): void {
    if (inactivityTimer === 0) return;
    window.clearTimeout(inactivityTimer);
    inactivityTimer = 0;
  }

  function sleepGame(): void {
    if (!gameIsVisible()) return;
    sleeping = true;
    ballImpact = 0;
    pressedCodes.clear();
    stopAnimation();
    syncCanvasState();
    draw();
  }

  function checkInactivity(): void {
    inactivityTimer = 0;
    if (!gameIsVisible() || motionIsReduced()) return;
    const remaining = INACTIVITY_HIDE_DELAY_MS - (performance.now() - lastGameActivityAt);
    if (remaining > 0) {
      inactivityTimer = window.setTimeout(checkInactivity, remaining);
      return;
    }
    sleepGame();
  }

  function noteGameActivity(): void {
    if (!gameIsVisible() || motionIsReduced()) return;
    lastGameActivityAt = performance.now();
    if (inactivityTimer === 0) {
      inactivityTimer = window.setTimeout(checkInactivity, INACTIVITY_HIDE_DELAY_MS);
    }
  }

  function wakeSleepingGame(forcePaused: boolean): void {
    if (!sleeping) return;
    sleeping = false;
    if (forcePaused) paused = true;
    syncCanvasState();
    draw();
    noteGameActivity();
    startAnimation();
  }

  function stopScoreTyping(): void {
    if (scoreTypingTimer === 0) return;
    window.clearTimeout(scoreTypingTimer);
    scoreTypingTimer = 0;
  }

  function syncScoreTerminal(): void {
    const score = `${state.score.left}:${state.score.right}`;
    const text = gameIsLit() && !motionIsReduced() ? `${SCORE_COMMAND} ${score}` : '';
    if (text === scoreTerminalKey) return;
    scoreTerminalKey = text;
    stopScoreTyping();
    scoreTerminal.textContent = '';
    if (text === '') return;

    let length = 0;
    function typeNextCharacter(): void {
      length += 1;
      scoreTerminal.textContent = text.slice(0, length);
      if (length < text.length) {
        scoreTypingTimer = window.setTimeout(typeNextCharacter, SCORE_TYPE_RATE_MS);
      } else {
        scoreTypingTimer = 0;
      }
    }
    scoreTypingTimer = window.setTimeout(typeNextCharacter, SCORE_TYPE_RATE_MS);
  }

  function syncCanvasState(): void {
    if (dismissed) canvas.dataset.pongState = CANVAS_STATE.DISMISSED;
    else if (motionIsReduced()) canvas.dataset.pongState = CANVAS_STATE.REDUCED_MOTION;
    else if (sleeping) canvas.dataset.pongState = CANVAS_STATE.SLEEPING;
    else if (paused) canvas.dataset.pongState = CANVAS_STATE.PAUSED;
    else if (active) canvas.dataset.pongState = CANVAS_STATE.ACTIVE;
    else canvas.dataset.pongState = CANVAS_STATE.IDLE;
    canvas.dataset.pongBall = gameIsVisible() ? BALL_PRESENCE.SPAWNED : BALL_PRESENCE.DORMANT;
    canvas.dataset.pongPaddles = gameIsLit() ? PADDLE_TONE.BRIGHT : PADDLE_TONE.DIM;
  }

  function syncScore(): void {
    if (dismissed || sleeping) {
      canvas.dataset.pongScore = EMPTY_SCORE;
      canvas.dataset.pongReveal = BALL_REVEAL_STATE.LOCKED;
    } else {
      canvas.dataset.pongScore = `${state.score.left}:${state.score.right}`;
      canvas.dataset.pongReveal = ballVisibilityUnlocked
        ? BALL_REVEAL_STATE.UNLOCKED
        : BALL_REVEAL_STATE.LOCKED;
    }
    syncScoreTerminal();
  }

  function ballIsOccluded(drawRadius: number): boolean {
    return BALL_OCCLUSION_SAMPLES.some(offset => {
      const sampleX = Math.min(
        Math.max(state.ball.x + offset.x * drawRadius, 0),
        court.width - 1
      );
      const sampleY = Math.min(
        Math.max(state.ball.y + offset.y * drawRadius, 0),
        court.height - 1
      );
      return document.elementsFromPoint(sampleX, sampleY).some(element => (
        element.closest(BALL_OCCLUDER_SELECTOR) !== null
      ));
    });
  }

  function syncBallEmphasis(drawRadius: number): void {
    const emphasis = !gameIsLit() || motionIsReduced()
      ? getBallEmphasis(false, 0)
      : getBallEmphasis(true, ballImpact);
    const diameter = drawRadius * 2;
    ballEmphasis.dataset.pongEmphasis = emphasis.reason;
    ballEmphasis.style.width = `${diameter}px`;
    ballEmphasis.style.height = `${diameter}px`;
    ballEmphasis.style.opacity = String(emphasis.opacity);
    ballEmphasis.style.transform = `translate3d(${state.ball.x - drawRadius}px, ${state.ball.y - drawRadius}px, 0) scale(${emphasis.scale})`;
  }

  function syncPaddleEmphasis(geometry: CourtGeometry): void {
    const opacity = gameIsLit() && !motionIsReduced() ? PONG_FOREGROUND_OPACITY : 0;
    const width = `${geometry.paddleWidth}px`;
    const height = `${geometry.paddleHeight}px`;
    const leftX = geometry.leftPaddleX - geometry.paddleWidth / 2;
    const rightX = geometry.rightPaddleX - geometry.paddleWidth / 2;
    const halfHeight = geometry.paddleHeight / 2;

    paddleEmphasis.left.style.width = width;
    paddleEmphasis.left.style.height = height;
    paddleEmphasis.left.style.opacity = String(opacity);
    paddleEmphasis.left.style.transform = `translate3d(${leftX}px, ${state.paddles.leftY - halfHeight}px, 0)`;
    paddleEmphasis.right.style.width = width;
    paddleEmphasis.right.style.height = height;
    paddleEmphasis.right.style.opacity = String(opacity);
    paddleEmphasis.right.style.transform = `translate3d(${rightX}px, ${state.paddles.rightY - halfHeight}px, 0)`;
  }

  function draw(): void {
    const geometry = getCourtGeometry(court);
    const gameVisible = gameIsVisible();
    const ballDrawRadius = geometry.ballRadius * BALL_DRAW_SCALE;
    const ballOccluded = gameVisible && !ballVisibilityUnlocked && ballIsOccluded(ballDrawRadius);
    const backgroundBallVisible = gameVisible && !ballVisibilityUnlocked && !ballOccluded;
    const foregroundPaddlesVisible = gameIsLit() && !motionIsReduced();
    const dormantCourtVisible = dismissed || sleeping;
    const leftPaddleY = dormantCourtVisible ? geometry.height / 2 : state.paddles.leftY;
    const rightPaddleY = dormantCourtVisible ? geometry.height / 2 : state.paddles.rightY;
    context.clearRect(0, 0, geometry.width, geometry.height);
    context.save();
    context.fillStyle = gameColor;
    context.strokeStyle = gameColor;

    context.globalAlpha = 0.45;
    context.lineWidth = 1;
    context.setLineDash([CENTER_LINE_DASH, CENTER_LINE_GAP]);
    context.beginPath();
    context.moveTo(geometry.width / 2, 0);
    context.lineTo(geometry.width / 2, geometry.height);
    context.stroke();

    context.globalAlpha = 1;
    context.setLineDash([]);
    if (!foregroundPaddlesVisible) {
      context.fillStyle = gameVisible ? ballColor : gameColor;
      context.fillRect(
        geometry.leftPaddleX - geometry.paddleWidth / 2,
        leftPaddleY - geometry.paddleHeight / 2,
        geometry.paddleWidth,
        geometry.paddleHeight
      );
      context.fillRect(
        geometry.rightPaddleX - geometry.paddleWidth / 2,
        rightPaddleY - geometry.paddleHeight / 2,
        geometry.paddleWidth,
        geometry.paddleHeight
      );
    }
    context.fillStyle = gameColor;
    if (backgroundBallVisible) {
      context.fillStyle = ballColor;
      context.fillRect(
        state.ball.x - ballDrawRadius,
        state.ball.y - ballDrawRadius,
        ballDrawRadius * 2,
        ballDrawRadius * 2
      );
      context.fillStyle = gameColor;
    }

    context.restore();
    syncScore();
    syncBallEmphasis(ballDrawRadius);
    syncPaddleEmphasis(geometry);
  }

  function resize(): void {
    const nextCourt = viewportSize();
    state = resizePongState(state, court, nextCourt);
    court = nextCourt;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    canvas.width = Math.round(court.width * pixelRatio);
    canvas.height = Math.round(court.height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const rootStyle = getComputedStyle(document.documentElement);
    gameColor = rootStyle.getPropertyValue('--fg-dim').trim() || FALLBACK_GAME_COLOR;
    ballColor = rootStyle.getPropertyValue('--fg-bright').trim() || FALLBACK_BALL_COLOR;
    draw();
  }

  function stopAnimation(): void {
    if (animationFrame === 0) return;
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  function applyKeyboardMovement(seconds: number): void {
    const geometry = getCourtGeometry(court);
    const leftDirection = Number(pressedCodes.has(CONTROL_CODE.LEFT_DOWN)) - Number(pressedCodes.has(CONTROL_CODE.LEFT_UP));
    const rightDirection = Number(pressedCodes.has(CONTROL_CODE.RIGHT_DOWN)) - Number(pressedCodes.has(CONTROL_CODE.RIGHT_UP));
    if (leftDirection !== 0) {
      state = setPaddleCenter(
        state,
        PADDLE_SIDE.LEFT,
        state.paddles.leftY + leftDirection * geometry.keyboardPaddleSpeed * seconds,
        court
      );
    }
    if (rightDirection !== 0) {
      state = setPaddleCenter(
        state,
        PADDLE_SIDE.RIGHT,
        state.paddles.rightY + rightDirection * geometry.keyboardPaddleSpeed * seconds,
        court
      );
    }
  }

  function runFrame(timestamp: number): void {
    animationFrame = 0;
    if (!active || dismissed || sleeping || paused || motionIsReduced() || document.hidden) return;
    const seconds = Math.min(
      Math.max(0, (timestamp - lastFrameTime) / 1000),
      MAX_FRAME_SECONDS
    );
    lastFrameTime = timestamp;
    applyKeyboardMovement(seconds);
    const nextState = advancePong(state, court, seconds);
    const paddleImpact = ballHadPaddleImpact(state.ball, nextState.ball);
    if (paddleImpact && !ballVisibilityUnlocked) {
      ballVisibilityUnlocked = true;
      syncCanvasState();
    }
    if (!ballVisibilityUnlocked) ballImpact = 0;
    else {
      ballImpact = ballHadImpact(state.ball, nextState.ball)
        ? 1
        : decayBallImpact(ballImpact, seconds);
    }
    state = nextState;
    draw();
    animationFrame = window.requestAnimationFrame(runFrame);
  }

  function startAnimation(): void {
    if (
      animationFrame !== 0 ||
      !active ||
      dismissed ||
      sleeping ||
      paused ||
      motionIsReduced() ||
      document.hidden
    ) return;
    lastFrameTime = performance.now();
    animationFrame = window.requestAnimationFrame(runFrame);
  }

  function activateGame(startPaused: boolean): void {
    if (active || dismissed || motionIsReduced()) return;
    active = true;
    paused = startPaused;
    sleeping = false;
    resetDiscoveryActivity();
    syncCanvasState();
    draw();
    noteGameActivity();
    startAnimation();
  }

  function toggleDismissal(): void {
    if (!active) return;
    paused = true;
    dismissed = !dismissed;
    ballImpact = 0;
    pressedCodes.clear();
    stopAnimation();
    if (dismissed) stopInactivityTimer();
    syncCanvasState();
    draw();
    if (!dismissed) noteGameActivity();
  }

  function togglePause(): void {
    if (!active) {
      activateGame(true);
      return;
    }
    if (sleeping) {
      wakeSleepingGame(true);
      return;
    }
    paused = !paused;
    pressedCodes.clear();
    syncCanvasState();
    noteGameActivity();
    if (paused) {
      ballImpact = 0;
      stopAnimation();
      draw();
    } else {
      startAnimation();
    }
  }

  function movePaddleAt(point: Point): void {
    if (paused) return;
    const side = point.x < court.width / 2 ? PADDLE_SIDE.LEFT : PADDLE_SIDE.RIGHT;
    state = setPaddleCenter(state, side, point.y, court);
    if (motionIsReduced()) draw();
  }

  function onPointerMove(event: PointerEvent): void {
    if (dismissed || motionIsReduced() || event.pointerType === 'touch') return;
    const point = { x: event.clientX, y: event.clientY };
    const distance = previousMouse
      ? Math.hypot(point.x - previousMouse.x, point.y - previousMouse.y)
      : 0;
    previousMouse = point;
    if (sleeping) wakeSleepingGame(false);
    movePaddleAt(point);
    if (active) {
      noteGameActivity();
      return;
    }
    if (discoveryMovementIsSustained(distance, performance.now())) activateGame(false);
  }

  function onTouch(event: TouchEvent): void {
    if (dismissed || motionIsReduced()) return;
    const nextTouches = new Map<number, Point>();
    let distance = 0;
    for (const touch of Array.from(event.touches)) {
      const point = { x: touch.clientX, y: touch.clientY };
      const previous = previousTouches.get(touch.identifier);
      if (previous) distance += Math.hypot(point.x - previous.x, point.y - previous.y);
      nextTouches.set(touch.identifier, point);
      movePaddleAt(point);
    }
    previousTouches = nextTouches;
    if (sleeping) wakeSleepingGame(false);
    if (active) {
      noteGameActivity();
      return;
    }
    if (discoveryMovementIsSustained(distance, performance.now())) activateGame(false);
  }

  function onTouchEnd(event: TouchEvent): void {
    previousTouches = new Map(
      Array.from(event.touches, touch => [
        touch.identifier,
        { x: touch.clientX, y: touch.clientY },
      ])
    );
    if (!active && previousTouches.size === 0) resetDiscoveryActivity();
    else if (gameIsVisible()) noteGameActivity();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.code === CONTROL_CODE.DISMISS) {
      if (!event.repeat && !motionIsReduced()) {
        if (!active) activateGame(true);
        else if (sleeping) wakeSleepingGame(true);
        else toggleDismissal();
      }
      return;
    }
    if (dismissed || motionIsReduced()) return;
    if (!isKeyboardGameContext()) return;
    if (event.code === CONTROL_CODE.TOGGLE_PAUSE) {
      if (!event.repeat) togglePause();
      return;
    }
    if (!active || sleeping || !GAMEPLAY_CODES.has(event.code)) return;
    pressedCodes.add(event.code);
    noteGameActivity();
    if (ARROW_CODES.has(event.code)) event.preventDefault();
  }

  function onKeyUp(event: KeyboardEvent): void {
    if (dismissed || sleeping || motionIsReduced()) return;
    if (!GAMEPLAY_CODES.has(event.code)) return;
    pressedCodes.delete(event.code);
    noteGameActivity();
    if (ARROW_CODES.has(event.code) && isKeyboardGameContext()) event.preventDefault();
  }

  function onVisibilityChange(): void {
    if (document.hidden) stopAnimation();
    else startAnimation();
  }

  function onMotionPreferenceChange(): void {
    stopAnimation();
    ballImpact = 0;
    pressedCodes.clear();
    if (motionIsReduced()) stopInactivityTimer();
    syncCanvasState();
    draw();
    if (!motionIsReduced()) noteGameActivity();
    startAnimation();
  }

  function teardown(): void {
    stopAnimation();
    stopInactivityTimer();
    stopScoreTyping();
    scoreTerminal.textContent = '';
    ballEmphasis.style.opacity = '0';
    ballEmphasis.dataset.pongEmphasis = 'hidden';
    paddleEmphasis.left.style.opacity = '0';
    paddleEmphasis.right.style.opacity = '0';
    abortController.abort();
    reducedMotion.removeEventListener('change', onMotionPreferenceChange);
  }

  syncCanvasState();
  resize();
  window.addEventListener('resize', resize, passiveListenerOptions);
  window.addEventListener('blur', () => pressedCodes.clear(), listenerOptions);
  window.addEventListener('pagehide', teardown, { once: true, signal: abortController.signal });
  document.addEventListener('pointermove', onPointerMove, passiveListenerOptions);
  document.addEventListener('touchstart', onTouch, passiveListenerOptions);
  document.addEventListener('touchmove', onTouch, passiveListenerOptions);
  document.addEventListener('touchend', onTouchEnd, passiveListenerOptions);
  document.addEventListener('touchcancel', onTouchEnd, passiveListenerOptions);
  document.addEventListener('keydown', onKeyDown, listenerOptions);
  document.addEventListener('keyup', onKeyUp, listenerOptions);
  document.addEventListener('visibilitychange', onVisibilityChange, listenerOptions);
  reducedMotion.addEventListener('change', onMotionPreferenceChange);

  return teardown;
}
