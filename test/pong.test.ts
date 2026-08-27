import { describe, expect, it } from 'vitest';
import {
  PADDLE_SIDE,
  PONG_SERVE_DELAY_SECONDS,
  advancePong,
  createPongState,
  getCourtGeometry,
  resizePongState,
  setPaddleCenter,
  type PongState,
} from '../src/lib/pong';

const COURT = Object.freeze({ width: 1000, height: 600 });
const EXPECTED_PADDLE_HIT_SPEED_MULTIPLIER = 1.08;

function playingState(): PongState {
  const state = createPongState(COURT);
  return {
    ...state,
    serve: { ...state.serve, remainingSeconds: 0 },
  };
}

function ballSpeed(state: PongState): number {
  return Math.hypot(state.ball.vx, state.ball.vy);
}

describe('Pong state', () => {
  it('starts centered behind a serve delay', () => {
    const state = createPongState(COURT, -1);

    expect(state.ball).toEqual({ x: 500, y: 300, vx: 0, vy: 0 });
    expect(state.paddles).toEqual({ leftY: 300, rightY: 300 });
    expect(state.score).toEqual({ left: 0, right: 0 });
    expect(state.serve).toEqual({
      direction: -1,
      remainingSeconds: PONG_SERVE_DELAY_SECONDS,
    });
  });

  it('clamps direct paddle movement inside the court', () => {
    const geometry = getCourtGeometry(COURT);
    const state = createPongState(COURT);
    const movedLeft = setPaddleCenter(state, PADDLE_SIDE.LEFT, -100, COURT);
    const movedRight = setPaddleCenter(movedLeft, PADDLE_SIDE.RIGHT, 1000, COURT);

    expect(movedRight.paddles.leftY).toBe(geometry.paddleHeight / 2);
    expect(movedRight.paddles.rightY).toBe(COURT.height - geometry.paddleHeight / 2);
    expect(state.paddles).toEqual({ leftY: 300, rightY: 300 });
  });

  it('scales live positions while preserving the ball angle on resize', () => {
    const nextCourt = { width: 500, height: 1200 };
    const state: PongState = {
      ...playingState(),
      ball: { x: 250, y: 150, vx: 200, vy: 100 },
      paddles: { leftY: 100, rightY: 500 },
    };
    const resized = resizePongState(state, COURT, nextCourt);

    expect(resized.ball.x).toBeCloseTo(125);
    expect(resized.ball.y).toBeCloseTo(300);
    expect(resized.paddles.leftY).toBeCloseTo(200);
    expect(resized.paddles.rightY).toBeCloseTo(1000);
    expect(Math.atan2(resized.ball.vy, resized.ball.vx)).toBeCloseTo(Math.atan2(100, 200));
  });
});

describe('Pong physics', () => {
  it('waits before serving and does not mutate its input', () => {
    const state = createPongState(COURT, 1);
    const waiting = advancePong(state, COURT, PONG_SERVE_DELAY_SECONDS - 0.01, () => 0);
    const served = advancePong(waiting, COURT, 0.02, () => 0);

    expect(waiting.ball.vx).toBe(0);
    expect(served.ball.vx).toBeGreaterThan(0);
    expect(served.ball.vy).toBeLessThan(0);
    expect(state.serve.remainingSeconds).toBe(PONG_SERVE_DELAY_SECONDS);
    expect(state.ball.vx).toBe(0);
  });

  it('reflects the ball off the top wall', () => {
    const geometry = getCourtGeometry(COURT);
    const state: PongState = {
      ...playingState(),
      ball: {
        x: COURT.width / 2,
        y: geometry.ballRadius + 1,
        vx: 100,
        vy: -300,
      },
    };
    const next = advancePong(state, COURT, 0.02, () => 0.5);

    expect(next.ball.y).toBeGreaterThanOrEqual(geometry.ballRadius);
    expect(next.ball.vy).toBeGreaterThan(0);
  });

  it('deflects the ball based on where it meets a paddle', () => {
    const geometry = getCourtGeometry(COURT);
    const state: PongState = {
      ...playingState(),
      ball: {
        x: geometry.leftPaddleX + geometry.paddleWidth / 2 + geometry.ballRadius + 2,
        y: COURT.height / 2 + geometry.paddleHeight * 0.3,
        vx: -350,
        vy: 0,
      },
    };
    const next = advancePong(state, COURT, 0.03, () => 0.5);

    expect(next.ball.vx).toBeGreaterThan(0);
    expect(next.ball.vy).toBeGreaterThan(0);
  });

  it('accelerates the ball by eight percent after every paddle return', () => {
    const geometry = getCourtGeometry(COURT);
    const leftReturn: PongState = {
      ...playingState(),
      ball: {
        x: geometry.leftPaddleX + geometry.paddleWidth / 2 + geometry.ballRadius + 2,
        y: COURT.height / 2,
        vx: -geometry.baseBallSpeed,
        vy: 0,
      },
    };
    const afterLeftReturn = advancePong(leftReturn, COURT, 0.03, () => 0.5);
    const firstReturnSpeed = ballSpeed(afterLeftReturn);
    const rightReturn: PongState = {
      ...afterLeftReturn,
      ball: {
        x: geometry.rightPaddleX - geometry.paddleWidth / 2 - geometry.ballRadius - 2,
        y: COURT.height / 2,
        vx: firstReturnSpeed,
        vy: 0,
      },
    };
    const afterRightReturn = advancePong(rightReturn, COURT, 0.03, () => 0.5);

    expect(firstReturnSpeed).toBeCloseTo(
      geometry.baseBallSpeed * EXPECTED_PADDLE_HIT_SPEED_MULTIPLIER
    );
    expect(ballSpeed(afterRightReturn)).toBeCloseTo(
      firstReturnSpeed * EXPECTED_PADDLE_HIT_SPEED_MULTIPLIER
    );
    expect(ballSpeed(afterRightReturn)).toBeLessThan(geometry.baseBallSpeed * 1.2);
  });

  it('resets the accelerated ball to base speed after a goal', () => {
    const geometry = getCourtGeometry(COURT);
    const accelerated: PongState = {
      ...playingState(),
      ball: {
        x: -geometry.ballRadius - 1,
        y: geometry.paddleHeight,
        vx: -geometry.maxBallSpeed,
        vy: 0,
      },
    };
    const scored = advancePong(accelerated, COURT, 0.01, () => 0.5);
    const served = advancePong(scored, COURT, PONG_SERVE_DELAY_SECONDS + 0.01, () => 0.5);

    expect(scored.score.right).toBe(1);
    expect(scored.ball.vx).toBe(0);
    expect(ballSpeed(served)).toBeCloseTo(geometry.baseBallSpeed);
  });

  it('subdivides delayed frames so the ball cannot tunnel through a paddle', () => {
    const geometry = getCourtGeometry(COURT);
    const state: PongState = {
      ...playingState(),
      ball: {
        x: geometry.leftPaddleX + 40,
        y: COURT.height / 2,
        vx: -1000,
        vy: 0,
      },
    };
    const next = advancePong(state, COURT, 0.05, () => 0.5);

    expect(next.ball.vx).toBeGreaterThan(0);
    expect(next.score.right).toBe(0);
  });

  it('awards a point and serves toward the player who missed', () => {
    const geometry = getCourtGeometry(COURT);
    const state: PongState = {
      ...playingState(),
      ball: {
        x: -geometry.ballRadius - 1,
        y: geometry.paddleHeight,
        vx: -250,
        vy: 0,
      },
    };
    const next = advancePong(state, COURT, 0.01, () => 0.5);

    expect(next.score).toEqual({ left: 0, right: 1 });
    expect(next.ball.x).toBe(COURT.width / 2);
    expect(next.ball.y).toBe(COURT.height / 2);
    expect(next.ball.vx).toBe(0);
    expect(next.serve.direction).toBe(-1);
    expect(next.serve.remainingSeconds).toBeGreaterThan(0);
  });

  it('never moves either paddle without player input', () => {
    const state: PongState = {
      ...playingState(),
      ball: { x: 500, y: 100, vx: 200, vy: 50 },
      paddles: { leftY: 120, rightY: 480 },
    };
    const next = advancePong(state, COURT, 0.1, () => 0.5);

    expect(next.paddles).toEqual(state.paddles);
  });
});
