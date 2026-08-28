export const PADDLE_SIDE = Object.freeze({
  LEFT: 'left',
  RIGHT: 'right',
} as const);

export type PaddleSide = (typeof PADDLE_SIDE)[keyof typeof PADDLE_SIDE];
export type ServeDirection = -1 | 1;

export interface CourtSize {
  width: number;
  height: number;
}

export interface CourtGeometry {
  width: number;
  height: number;
  paddleWidth: number;
  paddleHeight: number;
  paddleInset: number;
  leftPaddleX: number;
  rightPaddleX: number;
  ballRadius: number;
  baseBallSpeed: number;
  maxBallSpeed: number;
  keyboardPaddleSpeed: number;
}

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface PongState {
  ball: BallState;
  paddles: {
    leftY: number;
    rightY: number;
  };
  score: {
    left: number;
    right: number;
  };
  serve: {
    direction: ServeDirection;
    remainingSeconds: number;
  };
}

export type RandomSource = () => number;

export const PONG_SERVE_DELAY_SECONDS = 0.75;

const MIN_COURT_SIZE = 120;
const PADDLE_WIDTH_RATIO = 0.006;
const MIN_PADDLE_WIDTH = 4;
const MAX_PADDLE_WIDTH = 8;
const PADDLE_HEIGHT_RATIO = 0.14;
const MIN_PADDLE_HEIGHT = 60;
const MAX_PADDLE_HEIGHT = 116;
const PADDLE_INSET_RATIO = 0.035;
const MIN_PADDLE_INSET = 16;
const MAX_PADDLE_INSET = 52;
const BALL_RADIUS_RATIO = 0.008;
const MIN_BALL_RADIUS = 3;
const MAX_BALL_RADIUS = 7;
const BASE_BALL_SPEED_RATIO = 0.22;
const MIN_BALL_SPEED = 190;
const MAX_BASE_BALL_SPEED = 390;
const MAX_BALL_SPEED_MULTIPLIER = 2.7;
const KEYBOARD_SPEED_RATIO = 0.8;
const MIN_KEYBOARD_SPEED = 420;
const MAX_KEYBOARD_SPEED = 720;
const MAX_SIMULATION_STEP_SECONDS = 1 / 240;
const PADDLE_HIT_SPEED_MULTIPLIER = 1.096;
const MAX_BOUNCE_ANGLE = Math.PI * 0.34;
const MIN_SERVE_ANGLE = Math.PI * 0.06;
const SERVE_ANGLE_RANGE = Math.PI * 0.1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizedCourt(court: CourtSize): CourtSize {
  return {
    width: Math.max(MIN_COURT_SIZE, court.width),
    height: Math.max(MIN_COURT_SIZE, court.height),
  };
}

function normalizedRandom(random: RandomSource): number {
  const value = random();
  return Number.isFinite(value) ? clamp(value, 0, 1) : 0.5;
}

function copyState(state: PongState): PongState {
  return {
    ball: { ...state.ball },
    paddles: { ...state.paddles },
    score: { ...state.score },
    serve: { ...state.serve },
  };
}

export function getCourtGeometry(court: CourtSize): CourtGeometry {
  const { width, height } = normalizedCourt(court);
  const paddleWidth = clamp(width * PADDLE_WIDTH_RATIO, MIN_PADDLE_WIDTH, MAX_PADDLE_WIDTH);
  const paddleHeight = clamp(height * PADDLE_HEIGHT_RATIO, MIN_PADDLE_HEIGHT, MAX_PADDLE_HEIGHT);
  const paddleInset = clamp(width * PADDLE_INSET_RATIO, MIN_PADDLE_INSET, MAX_PADDLE_INSET);
  const ballRadius = clamp(Math.min(width, height) * BALL_RADIUS_RATIO, MIN_BALL_RADIUS, MAX_BALL_RADIUS);
  const baseBallSpeed = clamp(
    Math.hypot(width, height) * BASE_BALL_SPEED_RATIO,
    MIN_BALL_SPEED,
    MAX_BASE_BALL_SPEED
  );

  return {
    width,
    height,
    paddleWidth,
    paddleHeight,
    paddleInset,
    leftPaddleX: paddleInset + paddleWidth / 2,
    rightPaddleX: width - paddleInset - paddleWidth / 2,
    ballRadius,
    baseBallSpeed,
    maxBallSpeed: baseBallSpeed * MAX_BALL_SPEED_MULTIPLIER,
    keyboardPaddleSpeed: clamp(
      height * KEYBOARD_SPEED_RATIO,
      MIN_KEYBOARD_SPEED,
      MAX_KEYBOARD_SPEED
    ),
  };
}

export function createPongState(court: CourtSize, serveDirection: ServeDirection = 1): PongState {
  const geometry = getCourtGeometry(court);
  return {
    ball: {
      x: geometry.width / 2,
      y: geometry.height / 2,
      vx: 0,
      vy: 0,
    },
    paddles: {
      leftY: geometry.height / 2,
      rightY: geometry.height / 2,
    },
    score: {
      left: 0,
      right: 0,
    },
    serve: {
      direction: serveDirection,
      remainingSeconds: PONG_SERVE_DELAY_SECONDS,
    },
  };
}

export function setPaddleCenter(
  state: PongState,
  side: PaddleSide,
  centerY: number,
  court: CourtSize
): PongState {
  const geometry = getCourtGeometry(court);
  const halfHeight = geometry.paddleHeight / 2;
  const nextY = clamp(centerY, halfHeight, geometry.height - halfHeight);
  const paddles = { ...state.paddles };
  if (side === PADDLE_SIDE.LEFT) paddles.leftY = nextY;
  else paddles.rightY = nextY;
  return { ...state, paddles };
}

export function resizePongState(
  state: PongState,
  previousCourt: CourtSize,
  nextCourt: CourtSize
): PongState {
  const previous = getCourtGeometry(previousCourt);
  const next = getCourtGeometry(nextCourt);
  const speed = Math.hypot(state.ball.vx, state.ball.vy);
  const speedRatio = previous.baseBallSpeed > 0 ? speed / previous.baseBallSpeed : 0;
  const nextSpeed = Math.min(next.baseBallSpeed * speedRatio, next.maxBallSpeed);
  const angle = Math.atan2(state.ball.vy, state.ball.vx);
  const resized = copyState(state);

  resized.ball.x = clamp(
    state.ball.x * (next.width / previous.width),
    next.ballRadius,
    next.width - next.ballRadius
  );
  resized.ball.y = clamp(
    state.ball.y * (next.height / previous.height),
    next.ballRadius,
    next.height - next.ballRadius
  );
  resized.ball.vx = nextSpeed === 0 ? 0 : Math.cos(angle) * nextSpeed;
  resized.ball.vy = nextSpeed === 0 ? 0 : Math.sin(angle) * nextSpeed;
  resized.paddles.leftY = clamp(
    state.paddles.leftY * (next.height / previous.height),
    next.paddleHeight / 2,
    next.height - next.paddleHeight / 2
  );
  resized.paddles.rightY = clamp(
    state.paddles.rightY * (next.height / previous.height),
    next.paddleHeight / 2,
    next.height - next.paddleHeight / 2
  );

  return resized;
}

function launchBall(state: PongState, geometry: CourtGeometry, random: RandomSource): void {
  const angle = MIN_SERVE_ANGLE + normalizedRandom(random) * SERVE_ANGLE_RANGE;
  const verticalDirection = normalizedRandom(random) < 0.5 ? -1 : 1;
  state.ball.vx = Math.cos(angle) * geometry.baseBallSpeed * state.serve.direction;
  state.ball.vy = Math.sin(angle) * geometry.baseBallSpeed * verticalDirection;
}

function queueServe(state: PongState, geometry: CourtGeometry, direction: ServeDirection): void {
  state.ball.x = geometry.width / 2;
  state.ball.y = geometry.height / 2;
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.serve.direction = direction;
  state.serve.remainingSeconds = PONG_SERVE_DELAY_SECONDS;
}

function bounceFromPaddle(
  state: PongState,
  geometry: CourtGeometry,
  side: PaddleSide,
  paddleY: number
): void {
  const distanceFromCenter = state.ball.y - paddleY;
  const contact = clamp(distanceFromCenter / (geometry.paddleHeight / 2), -1, 1);
  const speed = Math.min(
    Math.hypot(state.ball.vx, state.ball.vy) * PADDLE_HIT_SPEED_MULTIPLIER,
    geometry.maxBallSpeed
  );
  const angle = contact * MAX_BOUNCE_ANGLE;
  const direction = side === PADDLE_SIDE.LEFT ? 1 : -1;
  state.ball.vx = Math.cos(angle) * speed * direction;
  state.ball.vy = Math.sin(angle) * speed;
}

function overlapsPaddleY(ball: BallState, paddleY: number, geometry: CourtGeometry): boolean {
  const paddleTop = paddleY - geometry.paddleHeight / 2;
  const paddleBottom = paddleY + geometry.paddleHeight / 2;
  return ball.y + geometry.ballRadius >= paddleTop && ball.y - geometry.ballRadius <= paddleBottom;
}

function simulateStep(
  state: PongState,
  geometry: CourtGeometry,
  seconds: number,
  random: RandomSource
): void {
  let movementSeconds = seconds;
  if (state.serve.remainingSeconds > 0) {
    const waitingSeconds = Math.min(state.serve.remainingSeconds, movementSeconds);
    state.serve.remainingSeconds -= waitingSeconds;
    movementSeconds -= waitingSeconds;
    if (state.serve.remainingSeconds > 0) return;
    state.serve.remainingSeconds = 0;
    launchBall(state, geometry, random);
    if (movementSeconds <= 0) return;
  }

  state.ball.x += state.ball.vx * movementSeconds;
  state.ball.y += state.ball.vy * movementSeconds;

  if (state.ball.vy < 0 && state.ball.y - geometry.ballRadius <= 0) {
    state.ball.y = geometry.ballRadius;
    state.ball.vy = Math.abs(state.ball.vy);
  } else if (state.ball.vy > 0 && state.ball.y + geometry.ballRadius >= geometry.height) {
    state.ball.y = geometry.height - geometry.ballRadius;
    state.ball.vy = -Math.abs(state.ball.vy);
  }

  const leftFace = geometry.leftPaddleX + geometry.paddleWidth / 2;
  const leftBack = geometry.leftPaddleX - geometry.paddleWidth / 2;
  if (
    state.ball.vx < 0 &&
    state.ball.x - geometry.ballRadius <= leftFace &&
    state.ball.x + geometry.ballRadius >= leftBack &&
    overlapsPaddleY(state.ball, state.paddles.leftY, geometry)
  ) {
    state.ball.x = leftFace + geometry.ballRadius;
    bounceFromPaddle(state, geometry, PADDLE_SIDE.LEFT, state.paddles.leftY);
  }

  const rightFace = geometry.rightPaddleX - geometry.paddleWidth / 2;
  const rightBack = geometry.rightPaddleX + geometry.paddleWidth / 2;
  if (
    state.ball.vx > 0 &&
    state.ball.x + geometry.ballRadius >= rightFace &&
    state.ball.x - geometry.ballRadius <= rightBack &&
    overlapsPaddleY(state.ball, state.paddles.rightY, geometry)
  ) {
    state.ball.x = rightFace - geometry.ballRadius;
    bounceFromPaddle(state, geometry, PADDLE_SIDE.RIGHT, state.paddles.rightY);
  }

  if (state.ball.x + geometry.ballRadius < 0) {
    state.score.right += 1;
    queueServe(state, geometry, -1);
  } else if (state.ball.x - geometry.ballRadius > geometry.width) {
    state.score.left += 1;
    queueServe(state, geometry, 1);
  }
}

export function advancePong(
  state: PongState,
  court: CourtSize,
  seconds: number,
  random: RandomSource = Math.random
): PongState {
  if (!Number.isFinite(seconds) || seconds <= 0) return state;
  const next = copyState(state);
  const geometry = getCourtGeometry(court);
  let remainingSeconds = seconds;

  while (remainingSeconds > 0) {
    const stepSeconds = Math.min(remainingSeconds, MAX_SIMULATION_STEP_SECONDS);
    simulateStep(next, geometry, stepSeconds, random);
    remainingSeconds -= stepSeconds;
  }

  return next;
}
