import { chromium } from 'playwright';

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:4321';
const DESKTOP_VIEWPORT = Object.freeze({ width: 1000, height: 700 });
const MOBILE_VIEWPORT = Object.freeze({ width: 390, height: 700 });
const INPUT_SETTLE_MS = 80;
const ACTIVE_STYLE_SETTLE_MS = 280;
const KEY_HOLD_MS = 140;
const SERVE_SETTLE_MS = 850;
const MOTION_SAMPLE_MS = 180;
const DISCOVERY_ACTIVATION_MS = 1200;
const DISCOVERY_CONTINUITY_GAP_MS = 300;
const DISCOVERY_TEST_BUFFER_MS = 180;
const INACTIVITY_HIDE_MS = 8000;
const IMPACT_WAIT_MS = 3500;
const FOREGROUND_WAIT_MS = 2000;
const BRIGHTNESS_SAMPLE_MS = 700;
const BRIGHTNESS_PROGRESSION_WAIT_MS = 14_000;
const SCORE_WAIT_MS = 5000;
const GOAL_EDGE_PROBE_PX = 80;
const GOAL_RESET_CENTER_TOLERANCE_PX = 2;
const PADDLE_POSITION_TOLERANCE = 4;
const MIN_KEYBOARD_TRAVEL = 30;
const PINCH_LEFT_START_X = 160;
const PINCH_RIGHT_START_X = 230;
const PINCH_SPREAD_STEP_PX = 20;
const PINCH_MAX_SPREAD_PX = 120;

const browser = await chromium.launch();
let failures = 0;

function report(label, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
}

function readCanvas() {
  const canvas = document.querySelector('[data-pong-background]');
  const ballEmphasis = document.querySelector('[data-pong-ball-emphasis]');
  const leftPaddleEmphasis = document.querySelector('[data-pong-paddle-emphasis="left"]');
  const rightPaddleEmphasis = document.querySelector('[data-pong-paddle-emphasis="right"]');
  const scoreTerminal = document.querySelector('[data-pong-score-terminal]');
  const style = getComputedStyle(canvas);
  const ballStyle = getComputedStyle(ballEmphasis);
  const rect = canvas.getBoundingClientRect();
  const ballRect = ballEmphasis.getBoundingClientRect();
  const pixelRatioX = canvas.width / rect.width;
  const pixelRatioY = canvas.height / rect.height;
  const ballPixelX = Math.min(
    canvas.width - 1,
    Math.max(0, Math.floor((ballRect.left + ballRect.width / 2) * pixelRatioX))
  );
  const ballPixelY = Math.min(
    canvas.height - 1,
    Math.max(0, Math.floor((ballRect.top + ballRect.height / 2) * pixelRatioY))
  );
  const ballInkAlpha = canvas.getContext('2d').getImageData(ballPixelX, ballPixelY, 1, 1).data[3];
  return {
    state: canvas.dataset.pongState,
    ballPresence: canvas.dataset.pongBall,
    brightness: canvas.dataset.pongBrightness,
    paddleTone: canvas.dataset.pongPaddles,
    reveal: canvas.dataset.pongReveal,
    score: canvas.dataset.pongScore,
    mode: document.documentElement.dataset.animationMode,
    width: canvas.width,
    height: canvas.height,
    rectWidth: rect.width,
    rectHeight: rect.height,
    opacity: style.opacity,
    pointerEvents: style.pointerEvents,
    ballEmphasis: ballEmphasis.dataset.pongEmphasis,
    ballOpacity: ballStyle.opacity,
    ballPointerEvents: ballStyle.pointerEvents,
    ballInkAlpha,
    leftPaddleOpacity: getComputedStyle(leftPaddleEmphasis).opacity,
    rightPaddleOpacity: getComputedStyle(rightPaddleEmphasis).opacity,
    scoreText: scoreTerminal.textContent,
    bootTyping: document.querySelector('[data-boot]').classList.contains('typing'),
  };
}

function readPaddles() {
  const canvas = document.querySelector('[data-pong-background]');
  const ball = document.querySelector('[data-pong-ball-emphasis]');
  const canvasRect = canvas.getBoundingClientRect();
  const context = canvas.getContext('2d');
  const pixelRatioX = canvas.width / canvasRect.width;
  const pixelRatioY = canvas.height / canvasRect.height;

  function readPaddle(side) {
    const element = document.querySelector(`[data-pong-paddle-emphasis="${side}"]`);
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const pixelX = Math.min(
      canvas.width - 1,
      Math.max(0, Math.floor((rect.left + rect.width / 2 - canvasRect.left) * pixelRatioX))
    );
    const pixelY = Math.min(
      canvas.height - 1,
      Math.max(0, Math.floor((rect.top + rect.height / 2 - canvasRect.top) * pixelRatioY))
    );
    return {
      center: rect.top + rect.height / 2,
      color: style.backgroundColor,
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      canvasAlpha: context.getImageData(pixelX, pixelY, 1, 1).data[3],
    };
  }

  return {
    ballColor: getComputedStyle(ball).backgroundColor,
    left: readPaddle('left'),
    right: readPaddle('right'),
  };
}

async function canvasChanges(page, waitMs = MOTION_SAMPLE_MS) {
  return page.evaluate(async delay => {
    const canvas = document.querySelector('[data-pong-background]');
    const before = canvas.toDataURL();
    await new Promise(resolve => setTimeout(resolve, delay));
    return before !== canvas.toDataURL();
  }, waitMs);
}

async function ballPositionChanges(page, waitMs = MOTION_SAMPLE_MS) {
  return page.evaluate(async delay => {
    const ball = document.querySelector('[data-pong-ball-emphasis]');
    const before = ball.style.transform;
    await new Promise(resolve => setTimeout(resolve, delay));
    return before !== ball.style.transform;
  }, waitMs);
}

async function sustainMouseMovement(page, duration) {
  const startedAt = Date.now();
  let step = 0;
  while (Date.now() - startedAt < duration) {
    await page.mouse.move(80 + (step % 2) * 48, 220 + (step % 3) * 24);
    await page.waitForTimeout(50);
    step += 1;
  }
}

async function spreadTouchPair(cdp, leftId, rightId, leftY, rightY) {
  for (let spread = PINCH_SPREAD_STEP_PX; spread <= PINCH_MAX_SPREAD_PX; spread += PINCH_SPREAD_STEP_PX) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: PINCH_LEFT_START_X - spread, y: leftY, id: leftId },
        { x: PINCH_RIGHT_START_X + spread, y: rightY, id: rightId },
      ],
    });
    await new Promise(resolve => setTimeout(resolve, 40));
  }
}

async function createPage(options) {
  const errors = [];
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return { context, page, errors };
}

const desktop = await createPage({
  viewport: DESKTOP_VIEWPORT,
  reducedMotion: 'no-preference',
});
await desktop.page.goto(SITE_URL, { waitUntil: 'domcontentloaded' });
const desktopControls = await desktop.page.evaluate(() => {
  const controls = document.querySelector('[data-pong-controls]');
  const tagline = document.querySelector('.tagline');
  const controlsRect = controls.getBoundingClientRect();
  const taglineRect = tagline.getBoundingClientRect();
  return {
    display: getComputedStyle(controls).display,
    text: controls.textContent.replace(/\s+/g, ' ').trim(),
    aligned: controlsRect.top >= taglineRect.top && controlsRect.bottom <= taglineRect.bottom,
    separated: taglineRect.right < controlsRect.left,
  };
});
report(
  'desktop header shows the Pong toggle hints without crowding the tagline',
  desktopControls.display === 'flex' &&
    desktopControls.text === '[esc] dismiss/show [P] pause/resume' &&
    desktopControls.aligned &&
    desktopControls.separated,
  `display=${desktopControls.display} text=${desktopControls.text}`
);
let canvas = await desktop.page.evaluate(readCanvas);
report(
  'idle court fills the viewport without intercepting input',
  canvas.state === 'idle' &&
    canvas.mode === 'system' &&
    canvas.width === DESKTOP_VIEWPORT.width &&
    canvas.height === DESKTOP_VIEWPORT.height &&
    canvas.rectWidth === DESKTOP_VIEWPORT.width &&
    canvas.rectHeight === DESKTOP_VIEWPORT.height &&
    canvas.pointerEvents === 'none' &&
    canvas.ballPresence === 'dormant' &&
    canvas.brightness === '0' &&
    canvas.paddleTone === 'dim' &&
    canvas.reveal === 'locked' &&
    canvas.ballEmphasis === 'hidden' &&
    canvas.ballOpacity === '0' &&
    canvas.leftPaddleOpacity === '0' &&
    canvas.rightPaddleOpacity === '0' &&
    canvas.scoreText === '' &&
    canvas.ballPointerEvents === 'none' &&
    canvas.ballInkAlpha < 200 &&
    canvas.opacity === '0.035',
  `state=${canvas.state} mode=${canvas.mode} opacity=${canvas.opacity} ball=${canvas.ballEmphasis}/${canvas.ballOpacity}`
);
report('idle court stays still before discovery', !(await canvasChanges(desktop.page)));

await desktop.page.mouse.move(80, 220);
await desktop.page.mouse.move(128, 268);
await desktop.page.waitForTimeout(DISCOVERY_CONTINUITY_GAP_MS);
await desktop.page.mouse.move(80, 220);
await desktop.page.mouse.move(128, 268);
await desktop.page.waitForTimeout(DISCOVERY_TEST_BUFFER_MS);
canvas = await desktop.page.evaluate(readCanvas);
report(
  'brief or interrupted mouse movement leaves Pong dormant',
  canvas.state === 'idle' &&
    canvas.ballPresence === 'dormant' &&
    canvas.paddleTone === 'dim' &&
    canvas.scoreText === ''
);

await desktop.page.keyboard.press('p');
await desktop.page.waitForTimeout(ACTIVE_STYLE_SETTLE_MS);
canvas = await desktop.page.evaluate(readCanvas);
report(
  'P skips discovery and reveals Pong paused',
  canvas.state === 'paused' &&
    canvas.ballPresence === 'spawned' &&
    canvas.paddleTone === 'dim' &&
    canvas.scoreText === '' &&
    !(await canvasChanges(desktop.page))
);

await desktop.page.reload({ waitUntil: 'domcontentloaded' });
await desktop.page.keyboard.press('Escape');
await desktop.page.waitForTimeout(SERVE_SETTLE_MS);
canvas = await desktop.page.evaluate(readCanvas);
report(
  'Escape skips discovery and starts Pong',
  canvas.state === 'active' &&
    canvas.ballPresence === 'spawned' &&
    canvas.paddleTone === 'dim' &&
    canvas.scoreText === '' &&
    (await ballPositionChanges(desktop.page))
);

await desktop.page.reload({ waitUntil: 'domcontentloaded' });
await sustainMouseMovement(
  desktop.page,
  DISCOVERY_ACTIVATION_MS + DISCOVERY_TEST_BUFFER_MS
);
await desktop.page.waitForFunction(() => document.querySelector('[data-pong-background]').dataset.pongState === 'active');
await desktop.page.waitForTimeout(ACTIVE_STYLE_SETTLE_MS);
canvas = await desktop.page.evaluate(readCanvas);
report(
  'sustained mouse movement starts the game without lighting it up',
  canvas.state === 'active' &&
    canvas.ballPresence === 'spawned' &&
    canvas.brightness === '0' &&
    canvas.paddleTone === 'dim' &&
    canvas.opacity === '0.12' &&
    canvas.scoreText === ''
);
let paddles = await desktop.page.evaluate(readPaddles);
report(
  'initial paddles stay on the subdued canvas layer with the ball',
  canvas.paddleTone === 'dim' &&
    paddles.left.opacity === '0' &&
    paddles.right.opacity === '0' &&
    paddles.left.pointerEvents === 'none' &&
    paddles.right.pointerEvents === 'none' &&
    paddles.left.canvasAlpha > 0 &&
    paddles.right.canvasAlpha > 0,
  `left=${paddles.left.color}/${paddles.left.opacity}/${paddles.left.canvasAlpha} right=${paddles.right.color}/${paddles.right.opacity}/${paddles.right.canvasAlpha} ball=${paddles.ballColor}`
);
report(
  'unreturned ball disappears completely behind page content',
  canvas.reveal === 'locked' &&
    canvas.ballEmphasis === 'hidden' &&
    canvas.ballOpacity === '0' &&
    canvas.ballInkAlpha < 200,
  `reveal=${canvas.reveal} ball=${canvas.ballEmphasis}/${canvas.ballOpacity} alpha=${canvas.ballInkAlpha}`
);
await desktop.page.waitForTimeout(SERVE_SETTLE_MS);
report('discovered game advances the ball', await ballPositionChanges(desktop.page));

const lockedScoreAfterMiss = await desktop.page.evaluate(async ({ timeout, edge, centerTolerance }) => {
  const ball = document.querySelector('[data-pong-ball-emphasis]');
  const canvas = document.querySelector('[data-pong-background]');
  const scoreTerminal = document.querySelector('[data-pong-score-terminal]');
  const deadline = performance.now() + timeout;
  let sawEdge = false;
  return new Promise(resolve => {
    function forceMiss() {
      const rect = ball.getBoundingClientRect();
      const ballX = rect.left + rect.width / 2;
      const ballY = rect.top + rect.height / 2;
      if (ballX < edge || ballX > innerWidth - edge) sawEdge = true;
      document.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: ballX < innerWidth / 2 ? 40 : innerWidth - 40,
        clientY: ballY < innerHeight / 2 ? innerHeight - 60 : 60,
        pointerType: 'mouse',
      }));
      if (sawEdge && Math.abs(ballX - innerWidth / 2) <= centerTolerance) {
        resolve({
          reset: true,
          score: canvas.dataset.pongScore,
          brightness: canvas.dataset.pongBrightness,
          scoreText: scoreTerminal.textContent,
        });
      } else if (performance.now() >= deadline) {
        resolve({
          reset: false,
          score: canvas.dataset.pongScore,
          brightness: canvas.dataset.pongBrightness,
          scoreText: scoreTerminal.textContent,
        });
      } else {
        requestAnimationFrame(forceMiss);
      }
    }
    forceMiss();
  });
}, {
  timeout: SCORE_WAIT_MS,
  edge: GOAL_EDGE_PROBE_PX,
  centerTolerance: GOAL_RESET_CENTER_TOLERANCE_PX,
});
report(
  'missed serves before the first paddle return leave the hidden score at zero',
  lockedScoreAfterMiss.reset &&
    lockedScoreAfterMiss.score === '0:0' &&
    lockedScoreAfterMiss.brightness === '0' &&
    lockedScoreAfterMiss.scoreText === '',
  `reset=${lockedScoreAfterMiss.reset} score=${lockedScoreAfterMiss.score} brightness=${lockedScoreAfterMiss.brightness} text=${lockedScoreAfterMiss.scoreText}`
);

const impactSeen = await desktop.page.evaluate(async timeout => {
  const ball = document.querySelector('[data-pong-ball-emphasis]');
  const canvas = document.querySelector('[data-pong-background]');
  const deadline = performance.now() + timeout;
  return new Promise(resolve => {
    function followBall() {
      const rect = ball.getBoundingClientRect();
      document.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        pointerType: 'mouse',
      }));
      if (ball.dataset.pongEmphasis === 'impact' && canvas.dataset.pongReveal === 'unlocked') {
        resolve(Number(getComputedStyle(ball).opacity) >= 0.3);
      } else if (performance.now() >= deadline) {
        resolve(false);
      } else {
        requestAnimationFrame(followBall);
      }
    }
    followBall();
  });
}, IMPACT_WAIT_MS);
report('ball briefly brightens on impact', impactSeen);

const foreground = await desktop.page.evaluate(async timeout => {
  const ball = document.querySelector('[data-pong-ball-emphasis]');
  const canvas = document.querySelector('[data-pong-background]');
  const scoreTerminal = document.querySelector('[data-pong-score-terminal]');
  const leftPaddle = document.querySelector('[data-pong-paddle-emphasis="left"]');
  const rightPaddle = document.querySelector('[data-pong-paddle-emphasis="right"]');
  const deadline = performance.now() + timeout;
  return new Promise(resolve => {
    function sample() {
      const ballStyle = getComputedStyle(ball);
      if (
        ball.dataset.pongEmphasis === 'unlocked' &&
        Number(ballStyle.opacity) >= 0.19 &&
        scoreTerminal.textContent === 'pong 0:0'
      ) {
        const canvasRect = canvas.getBoundingClientRect();
        const ballRect = ball.getBoundingClientRect();
        const pixelX = Math.min(
          canvas.width - 1,
          Math.max(0, Math.floor((ballRect.left + ballRect.width / 2) * canvas.width / canvasRect.width))
        );
        const pixelY = Math.min(
          canvas.height - 1,
          Math.max(0, Math.floor((ballRect.top + ballRect.height / 2) * canvas.height / canvasRect.height))
        );
        resolve({
          seen: true,
          ballColor: ballStyle.backgroundColor,
          ballOpacity: ballStyle.opacity,
          ballCanvasAlpha: canvas.getContext('2d').getImageData(pixelX, pixelY, 1, 1).data[3],
          brightness: canvas.dataset.pongBrightness,
          paddleTone: canvas.dataset.pongPaddles,
          scoreText: scoreTerminal.textContent,
          leftColor: getComputedStyle(leftPaddle).backgroundColor,
          leftOpacity: getComputedStyle(leftPaddle).opacity,
          rightColor: getComputedStyle(rightPaddle).backgroundColor,
          rightOpacity: getComputedStyle(rightPaddle).opacity,
        });
      } else if (performance.now() >= deadline) {
        resolve({ seen: false });
      } else {
        requestAnimationFrame(sample);
      }
    }
    sample();
  });
}, FOREGROUND_WAIT_MS);
report(
  'first paddle return enters the first brightness stage and types the score',
  foreground.seen &&
    foreground.brightness === '1' &&
    foreground.paddleTone === 'bright' &&
    foreground.scoreText === 'pong 0:0'
);
report(
  'first-stage paddles exactly match the unlocked ball',
  foreground.seen &&
    foreground.ballOpacity === '0.2' &&
    foreground.ballCanvasAlpha === 0 &&
    foreground.leftOpacity === foreground.ballOpacity &&
    foreground.rightOpacity === foreground.ballOpacity &&
    foreground.leftColor === foreground.ballColor &&
    foreground.rightColor === foreground.ballColor,
  `ball=${foreground.ballColor}/${foreground.ballOpacity} left=${foreground.leftColor}/${foreground.leftOpacity} right=${foreground.rightColor}/${foreground.rightOpacity}`
);

const unlockedBrightness = await desktop.page.evaluate(async duration => {
  const ball = document.querySelector('[data-pong-ball-emphasis]');
  const deadline = performance.now() + duration;
  let minimumOpacity = Number.POSITIVE_INFINITY;
  let sawUnlocked = false;
  return new Promise(resolve => {
    function sample() {
      const opacity = Number(getComputedStyle(ball).opacity);
      minimumOpacity = Math.min(minimumOpacity, opacity);
      if (ball.dataset.pongEmphasis === 'unlocked') sawUnlocked = true;
      if (performance.now() >= deadline) {
        resolve({ minimumOpacity, sawUnlocked });
      } else {
        requestAnimationFrame(sample);
      }
    }
    sample();
  });
}, BRIGHTNESS_SAMPLE_MS);
report(
  'first-stage ball never dims below its permanent opacity',
  unlockedBrightness.sawUnlocked && unlockedBrightness.minimumOpacity >= 0.2,
  `minimum=${unlockedBrightness.minimumOpacity}`
);

const brightnessProgression = await desktop.page.evaluate(async timeout => {
  const ball = document.querySelector('[data-pong-ball-emphasis]');
  const canvas = document.querySelector('[data-pong-background]');
  const leftPaddle = document.querySelector('[data-pong-paddle-emphasis="left"]');
  const rightPaddle = document.querySelector('[data-pong-paddle-emphasis="right"]');
  const deadline = performance.now() + timeout;
  const settled = [];
  return new Promise(resolve => {
    function followBall() {
      const rect = ball.getBoundingClientRect();
      document.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        pointerType: 'mouse',
      }));
      const stage = Number(canvas.dataset.pongBrightness);
      if (
        stage >= 2 &&
        ball.dataset.pongEmphasis === 'unlocked' &&
        !settled.some(sample => sample.stage === stage)
      ) {
        settled.push({
          stage,
          ballOpacity: getComputedStyle(ball).opacity,
          leftOpacity: getComputedStyle(leftPaddle).opacity,
          rightOpacity: getComputedStyle(rightPaddle).opacity,
        });
      }
      if (settled.some(sample => sample.stage === 4) || performance.now() >= deadline) {
        resolve(settled);
      } else {
        requestAnimationFrame(followBall);
      }
    }
    followBall();
  });
}, BRIGHTNESS_PROGRESSION_WAIT_MS);
report(
  'successive paddle returns settle at all four brightness stages',
  JSON.stringify(brightnessProgression) === JSON.stringify([
    { stage: 2, ballOpacity: '0.4', leftOpacity: '0.4', rightOpacity: '0.4' },
    { stage: 3, ballOpacity: '0.6', leftOpacity: '0.6', rightOpacity: '0.6' },
    { stage: 4, ballOpacity: '0.8', leftOpacity: '0.8', rightOpacity: '0.8' },
  ]),
  JSON.stringify(brightnessProgression)
);

const finalBrightness = await desktop.page.evaluate(async duration => {
  const ball = document.querySelector('[data-pong-ball-emphasis]');
  const canvas = document.querySelector('[data-pong-background]');
  const deadline = performance.now() + duration;
  let minimumOpacity = Number.POSITIVE_INFINITY;
  return new Promise(resolve => {
    function sample() {
      minimumOpacity = Math.min(minimumOpacity, Number(getComputedStyle(ball).opacity));
      if (performance.now() >= deadline) {
        resolve({
          stage: canvas.dataset.pongBrightness,
          minimumOpacity,
        });
      } else {
        requestAnimationFrame(sample);
      }
    }
    sample();
  });
}, BRIGHTNESS_SAMPLE_MS);
report(
  'fourth-stage ball stays at its permanent brightness',
  finalBrightness.stage === '4' && finalBrightness.minimumOpacity >= 0.8,
  `stage=${finalBrightness.stage} minimum=${finalBrightness.minimumOpacity}`
);

const scoreAfterPoint = await desktop.page.evaluate(async timeout => {
  const ball = document.querySelector('[data-pong-ball-emphasis]');
  const canvas = document.querySelector('[data-pong-background]');
  const scoreTerminal = document.querySelector('[data-pong-score-terminal]');
  const startingScore = canvas.dataset.pongScore;
  const deadline = performance.now() + timeout;
  let nextScore = '';
  let sawClear = false;
  const observer = new MutationObserver(() => {
    if (scoreTerminal.textContent === '') sawClear = true;
  });
  observer.observe(scoreTerminal, { childList: true, characterData: true, subtree: true });
  return new Promise(resolve => {
    function forceMiss() {
      if (nextScore === '') {
        const rect = ball.getBoundingClientRect();
        const ballX = rect.left + rect.width / 2;
        const ballY = rect.top + rect.height / 2;
        document.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true,
          clientX: ballX < innerWidth / 2 ? 40 : innerWidth - 40,
          clientY: ballY < innerHeight / 2 ? innerHeight - 60 : 60,
          pointerType: 'mouse',
        }));
        if (canvas.dataset.pongScore !== startingScore) {
          nextScore = canvas.dataset.pongScore;
        }
      }
      if (nextScore !== '' && scoreTerminal.textContent === `pong ${nextScore}`) {
        const paddleOpacities = Array.from(
          document.querySelectorAll('[data-pong-paddle-emphasis]'),
          paddle => getComputedStyle(paddle).opacity
        );
        observer.disconnect();
        resolve({
          visibilityPersisted: canvas.dataset.pongReveal === 'unlocked' &&
          canvas.dataset.pongBrightness === '4' &&
          canvas.dataset.pongPaddles === 'bright' &&
          paddleOpacities.every(opacity => opacity === '0.8'),
          sawClear,
          score: nextScore,
          scoreText: scoreTerminal.textContent,
        });
      } else if (performance.now() >= deadline) {
        observer.disconnect();
        resolve({
          visibilityPersisted: false,
          sawClear,
          score: nextScore,
          scoreText: scoreTerminal.textContent,
        });
      } else {
        requestAnimationFrame(forceMiss);
      }
    }
    forceMiss();
  });
}, SCORE_WAIT_MS);
report('fourth-stage brightness persists after a point', scoreAfterPoint.visibilityPersisted);
report(
  'a goal clears and retypes the terminal score',
  scoreAfterPoint.sawClear &&
    scoreAfterPoint.score !== '' &&
    scoreAfterPoint.scoreText === `pong ${scoreAfterPoint.score}`,
  `score=${scoreAfterPoint.score} text=${scoreAfterPoint.scoreText} cleared=${scoreAfterPoint.sawClear}`
);

await desktop.page.keyboard.press('p');
canvas = await desktop.page.evaluate(readCanvas);
const scoreBeforeSleep = canvas.score;
report('P leaves the lit game paused for the inactivity check', canvas.state === 'paused');
await desktop.page.waitForFunction(
  () => document.querySelector('[data-pong-background]').dataset.pongState === 'sleeping',
  null,
  { timeout: INACTIVITY_HIDE_MS + 2000 }
);
await desktop.page.waitForTimeout(ACTIVE_STYLE_SETTLE_MS);
canvas = await desktop.page.evaluate(readCanvas);
report(
  'inactivity returns Pong to the dormant court',
  canvas.state === 'sleeping' &&
    canvas.ballPresence === 'dormant' &&
    canvas.brightness === '4' &&
    canvas.paddleTone === 'dim' &&
    canvas.reveal === 'locked' &&
    canvas.score === '0:0' &&
    canvas.ballOpacity === '0' &&
    canvas.leftPaddleOpacity === '0' &&
    canvas.rightPaddleOpacity === '0' &&
    canvas.scoreText === '' &&
    canvas.opacity === '0.035' &&
    !(await canvasChanges(desktop.page)),
  `state=${canvas.state} ball=${canvas.ballPresence} paddles=${canvas.paddleTone} score=${canvas.scoreText}`
);

await desktop.page.mouse.move(81, 111);
await desktop.page.waitForFunction(() => document.querySelector('[data-pong-background]').dataset.pongState === 'paused');
await desktop.page.waitForFunction(
  score => document.querySelector('[data-pong-score-terminal]').textContent === `pong ${score}`,
  scoreBeforeSleep
);
await desktop.page.waitForTimeout(ACTIVE_STYLE_SETTLE_MS);
canvas = await desktop.page.evaluate(readCanvas);
report(
  'the next mouse movement restores the preserved game immediately',
  canvas.state === 'paused' &&
    canvas.ballPresence === 'spawned' &&
    canvas.brightness === '4' &&
    canvas.paddleTone === 'bright' &&
    canvas.reveal === 'unlocked' &&
    canvas.score === scoreBeforeSleep &&
    canvas.scoreText === `pong ${scoreBeforeSleep}` &&
    canvas.opacity === '0.12' &&
    canvas.ballOpacity === '0.8' &&
    canvas.leftPaddleOpacity === '0.8' &&
    canvas.rightPaddleOpacity === '0.8' &&
    !(await ballPositionChanges(desktop.page)),
  `state=${canvas.state} score=${canvas.score}/${canvas.scoreText}`
);

await desktop.page.keyboard.press('p');
canvas = await desktop.page.evaluate(readCanvas);
await desktop.page.waitForTimeout(SERVE_SETTLE_MS);
report(
  'P resumes the game after its inactivity wake',
  canvas.state === 'active' && (await ballPositionChanges(desktop.page))
);

await desktop.page.mouse.move(80, 110);
await desktop.page.waitForTimeout(INPUT_SETTLE_MS);
paddles = await desktop.page.evaluate(readPaddles);
report(
  'mouse controls the paddle on its half',
  Math.abs(paddles.left.center - 110) <= PADDLE_POSITION_TOLERANCE,
  `leftY=${paddles.left.center}`
);

const leftBeforeKey = paddles.left.center;
await desktop.page.keyboard.down('s');
await desktop.page.waitForTimeout(KEY_HOLD_MS);
await desktop.page.keyboard.up('s');
await desktop.page.waitForTimeout(INPUT_SETTLE_MS);
paddles = await desktop.page.evaluate(readPaddles);
report(
  'W and S control the left paddle',
  paddles.left.center - leftBeforeKey >= MIN_KEYBOARD_TRAVEL,
  `${leftBeforeKey}->${paddles.left.center}`
);

await desktop.page.evaluate(() => window.scrollTo(0, 0));
await desktop.page.mouse.move(920, 300);
await desktop.page.waitForTimeout(INPUT_SETTLE_MS);
paddles = await desktop.page.evaluate(readPaddles);
const rightBeforeKey = paddles.right.center;
await desktop.page.keyboard.down('ArrowDown');
await desktop.page.waitForTimeout(KEY_HOLD_MS);
await desktop.page.keyboard.up('ArrowDown');
await desktop.page.waitForTimeout(INPUT_SETTLE_MS);
paddles = await desktop.page.evaluate(readPaddles);
const scrollY = await desktop.page.evaluate(() => window.scrollY);
report(
  'arrow keys control the right paddle without scrolling during play',
  paddles.right.center - rightBeforeKey >= MIN_KEYBOARD_TRAVEL && scrollY === 0,
  `${rightBeforeKey}->${paddles.right.center} scrollY=${scrollY}`
);

const focusedArrowPrevented = await desktop.page.evaluate(() => {
  const link = document.querySelector('a[href^="https://"]');
  link.focus();
  const event = new KeyboardEvent('keydown', {
    code: 'ArrowDown',
    key: 'ArrowDown',
    bubbles: true,
    cancelable: true,
  });
  link.dispatchEvent(event);
  return event.defaultPrevented;
});
report('focused page links retain normal arrow-key behavior', !focusedArrowPrevented);
await desktop.page.evaluate(() => document.activeElement.blur());

await desktop.page.keyboard.press('p');
canvas = await desktop.page.evaluate(readCanvas);
report(
  'P pauses the game without dimming it',
  canvas.state === 'paused' && canvas.opacity === '0.12' && !(await canvasChanges(desktop.page))
);
const pausedPaddles = await desktop.page.evaluate(readPaddles);
await desktop.page.mouse.move(80, 480);
await desktop.page.keyboard.down('s');
await desktop.page.waitForTimeout(KEY_HOLD_MS);
await desktop.page.keyboard.up('s');
await desktop.page.waitForTimeout(INPUT_SETTLE_MS);
paddles = await desktop.page.evaluate(readPaddles);
report(
  'pause freezes paddle input as well as the ball',
  paddles.left.center === pausedPaddles.left.center &&
    paddles.right.center === pausedPaddles.right.center &&
    !(await canvasChanges(desktop.page)),
  `left=${pausedPaddles.left.center}->${paddles.left.center} right=${pausedPaddles.right.center}->${paddles.right.center}`
);
await desktop.page.keyboard.press('p');
canvas = await desktop.page.evaluate(readCanvas);
report('P resumes the game', canvas.state === 'active');

await desktop.page.keyboard.press('Escape');
await desktop.page.waitForTimeout(ACTIVE_STYLE_SETTLE_MS);
canvas = await desktop.page.evaluate(readCanvas);
let dismissedPaddles = await desktop.page.evaluate(readPaddles);
report(
  'Escape dismisses active Pong back to the dormant court',
  canvas.state === 'dismissed' &&
    canvas.ballPresence === 'dormant' &&
    canvas.brightness === '4' &&
    canvas.paddleTone === 'dim' &&
    canvas.reveal === 'locked' &&
    canvas.score === '0:0' &&
    canvas.ballEmphasis === 'hidden' &&
    canvas.ballOpacity === '0' &&
    canvas.leftPaddleOpacity === '0' &&
    canvas.rightPaddleOpacity === '0' &&
    canvas.scoreText === '' &&
    canvas.opacity === '0.035' &&
    !(await canvasChanges(desktop.page)),
  `state=${canvas.state} ball=${canvas.ballPresence}/${canvas.ballOpacity} paddles=${canvas.paddleTone}/${canvas.leftPaddleOpacity}/${canvas.rightPaddleOpacity} score=${canvas.score}/${canvas.scoreText}`
);

await desktop.page.mouse.move(80, 200);
await desktop.page.mouse.move(80, 360);
await desktop.page.keyboard.press('s');
await desktop.page.waitForTimeout(INPUT_SETTLE_MS);
canvas = await desktop.page.evaluate(readCanvas);
paddles = await desktop.page.evaluate(readPaddles);
report(
  'dismissed Pong ignores all game input except Escape',
  canvas.state === 'dismissed' &&
    canvas.ballPresence === 'dormant' &&
    canvas.paddleTone === 'dim' &&
    paddles.left.center === dismissedPaddles.left.center &&
    paddles.right.center === dismissedPaddles.right.center &&
    !(await canvasChanges(desktop.page)),
  `state=${canvas.state} ball=${canvas.ballPresence} paddles=${dismissedPaddles.left.center}/${dismissedPaddles.right.center}->${paddles.left.center}/${paddles.right.center}`
);

await desktop.page.keyboard.press('Escape');
await desktop.page.waitForFunction(() => document.querySelector('[data-pong-background]').dataset.pongState === 'active');
await desktop.page.waitForTimeout(ACTIVE_STYLE_SETTLE_MS);
canvas = await desktop.page.evaluate(readCanvas);
paddles = await desktop.page.evaluate(readPaddles);
report(
  'a second Escape restores the preserved running game',
  canvas.state === 'active' &&
    canvas.ballPresence === 'spawned' &&
    canvas.brightness === '4' &&
    canvas.paddleTone === 'bright' &&
    canvas.reveal === 'unlocked' &&
    canvas.score !== '0:0' &&
    canvas.scoreText === `pong ${canvas.score}` &&
    canvas.leftPaddleOpacity === '0.8' &&
    canvas.rightPaddleOpacity === '0.8' &&
    canvas.opacity === '0.12' &&
    paddles.left.center === dismissedPaddles.left.center &&
    paddles.right.center === dismissedPaddles.right.center,
  `state=${canvas.state} score=${canvas.score}/${canvas.scoreText} paddles=${paddles.left.center}/${paddles.right.center}`
);
report(
  'Escape resumes the ball when it was running before dismissal',
  await ballPositionChanges(desktop.page)
);

await desktop.page.keyboard.press('p');
const pausedBeforeDismissal = await desktop.page.evaluate(readCanvas);
const pausedBeforeDismissalPaddles = await desktop.page.evaluate(readPaddles);
await desktop.page.keyboard.press('Escape');
await desktop.page.waitForFunction(() => document.querySelector('[data-pong-background]').dataset.pongState === 'dismissed');
await desktop.page.keyboard.press('Escape');
await desktop.page.waitForFunction(() => document.querySelector('[data-pong-background]').dataset.pongState === 'paused');
await desktop.page.waitForTimeout(ACTIVE_STYLE_SETTLE_MS);
canvas = await desktop.page.evaluate(readCanvas);
paddles = await desktop.page.evaluate(readPaddles);
report(
  'Escape also preserves a paused game as paused',
  canvas.state === 'paused' &&
    canvas.score === pausedBeforeDismissal.score &&
    canvas.reveal === pausedBeforeDismissal.reveal &&
    canvas.scoreText === pausedBeforeDismissal.scoreText &&
    paddles.left.center === pausedBeforeDismissalPaddles.left.center &&
    paddles.right.center === pausedBeforeDismissalPaddles.right.center &&
    !(await canvasChanges(desktop.page)),
  `state=${canvas.state} score=${pausedBeforeDismissal.score}->${canvas.score}`
);

await desktop.page.reload({ waitUntil: 'domcontentloaded' });
canvas = await desktop.page.evaluate(readCanvas);
await sustainMouseMovement(
  desktop.page,
  DISCOVERY_ACTIVATION_MS + DISCOVERY_TEST_BUFFER_MS
);
await desktop.page.waitForFunction(() => document.querySelector('[data-pong-background]').dataset.pongState === 'active');
await desktop.page.waitForTimeout(ACTIVE_STYLE_SETTLE_MS);
const rediscoveredCanvas = await desktop.page.evaluate(readCanvas);
report(
  'refresh resets dismissal and restores discovery',
  canvas.state === 'idle' &&
    canvas.ballPresence === 'dormant' &&
    canvas.brightness === '0' &&
    canvas.paddleTone === 'dim' &&
    canvas.scoreText === '' &&
    rediscoveredCanvas.state === 'active' &&
    rediscoveredCanvas.brightness === '0' &&
    rediscoveredCanvas.reveal === 'locked' &&
    rediscoveredCanvas.paddleTone === 'dim' &&
    rediscoveredCanvas.scoreText === ''
);

for (const query of ['?animate=0', '?animate=false']) {
  await desktop.page.goto(`${SITE_URL}${query}`, { waitUntil: 'domcontentloaded' });
  canvas = await desktop.page.evaluate(readCanvas);
  report(
    `${query} disables boot and Pong when the system allows motion`,
    canvas.mode === 'disable' &&
      canvas.state === 'reduced-motion' &&
      canvas.ballOpacity === '0' &&
      canvas.leftPaddleOpacity === '0' &&
      canvas.rightPaddleOpacity === '0' &&
      canvas.scoreText === '' &&
      canvas.bootTyping === false,
    `mode=${canvas.mode} state=${canvas.state} ball=${canvas.ballOpacity} typing=${canvas.bootTyping}`
  );
}
report('desktop run has no browser errors', desktop.errors.length === 0, desktop.errors.join(' | '));
await desktop.context.close();

const reduced = await createPage({
  viewport: DESKTOP_VIEWPORT,
  reducedMotion: 'reduce',
});
await reduced.page.goto(SITE_URL, { waitUntil: 'domcontentloaded' });
canvas = await reduced.page.evaluate(readCanvas);
report(
  'system reduced motion keeps boot and Pong static',
    canvas.mode === 'system' &&
    canvas.state === 'reduced-motion' &&
    canvas.ballPresence === 'dormant' &&
    canvas.paddleTone === 'dim' &&
    canvas.scoreText === '' &&
    canvas.bootTyping === false &&
    canvas.opacity === '0.025',
  `mode=${canvas.mode} state=${canvas.state} typing=${canvas.bootTyping}`
);
await reduced.page.mouse.move(80, 220);
await reduced.page.mouse.move(80, 320);
report('reduced-motion Pong remains static after input', !(await canvasChanges(reduced.page)));
canvas = await reduced.page.evaluate(readCanvas);
report(
  'reduced-motion keeps foreground game pieces hidden',
  canvas.ballEmphasis === 'hidden' &&
    canvas.ballPresence === 'dormant' &&
    canvas.paddleTone === 'dim' &&
    canvas.ballOpacity === '0' &&
    canvas.leftPaddleOpacity === '0' &&
    canvas.rightPaddleOpacity === '0' &&
    canvas.scoreText === '',
  `ball=${canvas.ballPresence}/${canvas.ballEmphasis}/${canvas.ballOpacity} paddles=${canvas.paddleTone}/${canvas.leftPaddleOpacity}/${canvas.rightPaddleOpacity} score=${canvas.scoreText}`
);

await reduced.page.keyboard.press('Escape');
await reduced.page.waitForFunction(() => (
  document.documentElement.dataset.animationMode === 'force' &&
  document.querySelector('[data-pong-background]').dataset.pongState === 'active'
));
await reduced.page.waitForTimeout(SERVE_SETTLE_MS);
canvas = await reduced.page.evaluate(readCanvas);
report(
  'Escape opts system reduced-motion users into a running game',
  canvas.mode === 'force' &&
    canvas.state === 'active' &&
    canvas.ballPresence === 'spawned' &&
    canvas.brightness === '0' &&
    canvas.opacity === '0.12' &&
    (await ballPositionChanges(reduced.page)),
  `mode=${canvas.mode} state=${canvas.state} ball=${canvas.ballPresence}`
);
await reduced.page.waitForFunction(
  () => document.querySelector('[data-pong-background]').dataset.pongState === 'sleeping',
  null,
  { timeout: INACTIVITY_HIDE_MS + 2000 }
);
await reduced.page.keyboard.press('Escape');
await reduced.page.waitForTimeout(ACTIVE_STYLE_SETTLE_MS);
canvas = await reduced.page.evaluate(readCanvas);
report(
  'Escape restarts the reduced-motion game after inactivity',
  canvas.mode === 'force' &&
    canvas.state === 'active' &&
    (await ballPositionChanges(reduced.page, FOREGROUND_WAIT_MS)),
  `mode=${canvas.mode} state=${canvas.state}`
);

for (const query of ['?animate=1', '?animate=true', '?animate=anything']) {
  await reduced.page.goto(`${SITE_URL}${query}`, { waitUntil: 'domcontentloaded' });
  canvas = await reduced.page.evaluate(readCanvas);
  report(
    `${query} forces boot and enables Pong`,
    canvas.mode === 'force' && canvas.state === 'idle' && canvas.bootTyping === true,
    `mode=${canvas.mode} state=${canvas.state} typing=${canvas.bootTyping}`
  );
}

await reduced.page.goto(`${SITE_URL}?animate`, { waitUntil: 'domcontentloaded' });
canvas = await reduced.page.evaluate(readCanvas);
report(
  'bare ?animate forces boot and enables Pong',
  canvas.mode === 'force' && canvas.state === 'idle' && canvas.bootTyping === true,
  `mode=${canvas.mode} state=${canvas.state} typing=${canvas.bootTyping}`
);
await reduced.page.keyboard.press('p');
await reduced.page.keyboard.press('p');
await reduced.page.waitForTimeout(SERVE_SETTLE_MS);
canvas = await reduced.page.evaluate(readCanvas);
report(
  '?animate Pong advances despite reduced motion',
  canvas.state === 'active' &&
    canvas.reveal === 'locked' &&
    canvas.paddleTone === 'dim' &&
    canvas.scoreText === '' &&
    (await ballPositionChanges(reduced.page)),
  `state=${canvas.state} score=${canvas.scoreText}`
);

await reduced.page.goto(`${SITE_URL}?animate=false`, { waitUntil: 'domcontentloaded' });
canvas = await reduced.page.evaluate(readCanvas);
report(
  '?animate=false keeps both animations disabled',
  canvas.mode === 'disable' &&
    canvas.state === 'reduced-motion' &&
    canvas.ballPresence === 'dormant' &&
    canvas.paddleTone === 'dim' &&
    canvas.scoreText === '' &&
    canvas.bootTyping === false,
  `mode=${canvas.mode} state=${canvas.state} ball=${canvas.ballPresence} paddles=${canvas.paddleTone} score=${canvas.scoreText} typing=${canvas.bootTyping}`
);
await reduced.page.keyboard.press('Escape');
await reduced.page.keyboard.press('p');
await reduced.page.waitForTimeout(ACTIVE_STYLE_SETTLE_MS);
canvas = await reduced.page.evaluate(readCanvas);
report(
  'Escape does not override explicit animation disablement',
  canvas.mode === 'disable' &&
    canvas.state === 'reduced-motion' &&
    canvas.ballPresence === 'dormant' &&
    canvas.brightness === '0' &&
    !(await canvasChanges(reduced.page)),
  `mode=${canvas.mode} state=${canvas.state}`
);
report('reduced-motion run has no browser errors', reduced.errors.length === 0, reduced.errors.join(' | '));
await reduced.context.close();

const mobile = await createPage({
  viewport: MOBILE_VIEWPORT,
  reducedMotion: 'no-preference',
  hasTouch: true,
  isMobile: true,
});
await mobile.page.goto(SITE_URL, { waitUntil: 'domcontentloaded' });
const mobileControlsDisplay = await mobile.page.locator('[data-pong-controls]').evaluate(
  controls => getComputedStyle(controls).display
);
report(
  'mobile header keeps the Pong keyboard hints hidden',
  mobileControlsDisplay === 'none',
  `display=${mobileControlsDisplay}`
);
const cdp = await mobile.context.newCDPSession(mobile.page);
await mobile.page.evaluate(() => {
  globalThis.__pongTouchProbe = [];
  for (const type of ['touchstart', 'touchmove', 'touchend']) {
    document.addEventListener(type, event => {
      globalThis.__pongTouchProbe.push({
        type,
        touches: event.touches.length,
        defaultPrevented: event.defaultPrevented,
      });
    });
  }
});

await cdp.send('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [{ x: 195, y: 600, id: 1 }],
});
for (const y of [540, 480, 420, 360, 300]) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: 195, y, id: 1 }],
  });
  await mobile.page.waitForTimeout(40);
}
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await mobile.page.waitForTimeout(ACTIVE_STYLE_SETTLE_MS);
canvas = await mobile.page.evaluate(readCanvas);
let mobileGesture = await mobile.page.evaluate(() => ({
  scrollY: window.scrollY,
  events: globalThis.__pongTouchProbe,
}));
report(
  'one-finger scrolling leaves Pong dormant and keeps native touch behavior',
  canvas.state === 'idle' &&
    canvas.paddleTone === 'dim' &&
    canvas.scoreText === '' &&
    mobileGesture.scrollY > 0 &&
    mobileGesture.events.every(event => !event.defaultPrevented),
  `state=${canvas.state} scrollY=${mobileGesture.scrollY}`
);

await mobile.page.evaluate(() => {
  window.scrollTo(0, 0);
  globalThis.__pongTouchProbe = [];
});
await mobile.page.waitForTimeout(INPUT_SETTLE_MS);

await cdp.send('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [
    { x: 40, y: 250, id: 3 },
    { x: 120, y: 450, id: 4 },
  ],
});
await mobile.page.waitForTimeout(INPUT_SETTLE_MS);
canvas = await mobile.page.evaluate(readCanvas);
report(
  'two touches on the same half do not claim the page',
  canvas.state === 'idle',
  `state=${canvas.state}`
);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

await mobile.page.evaluate(() => {
  globalThis.__pongTouchProbe = [];
});
await cdp.send('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [{ x: PINCH_LEFT_START_X, y: 250, id: 5 }],
});
await mobile.page.waitForTimeout(INPUT_SETTLE_MS);
canvas = await mobile.page.evaluate(readCanvas);
report('the first thumb alone does not activate Pong', canvas.state === 'idle');

await cdp.send('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [
    { x: PINCH_LEFT_START_X, y: 250, id: 5 },
    { x: PINCH_RIGHT_START_X, y: 450, id: 6 },
  ],
});
await mobile.page.waitForTimeout(INPUT_SETTLE_MS);
paddles = await mobile.page.evaluate(readPaddles);
canvas = await mobile.page.evaluate(readCanvas);
mobileGesture = await mobile.page.evaluate(() => ({
  scrollY: window.scrollY,
  events: globalThis.__pongTouchProbe,
}));
report(
  'the second thumb activates Pong immediately and positions both paddles',
  canvas.state === 'active' &&
    canvas.paddleTone === 'dim' &&
    canvas.scoreText === '' &&
    Math.abs(paddles.left.center - 250) <= PADDLE_POSITION_TOLERANCE &&
    Math.abs(paddles.right.center - 450) <= PADDLE_POSITION_TOLERANCE,
  `state=${canvas.state} leftY=${paddles.left.center} rightY=${paddles.right.center}`
);
report(
  'Pong claims only the completed two-thumb gesture',
  mobileGesture.scrollY === 0 &&
    mobileGesture.events.some(event => event.touches === 1 && !event.defaultPrevented) &&
    mobileGesture.events.some(event => event.touches === 2 && event.defaultPrevented),
  `scrollY=${mobileGesture.scrollY} events=${JSON.stringify(mobileGesture.events)}`
);

await spreadTouchPair(cdp, 5, 6, 250, 450);
mobileGesture = await mobile.page.evaluate(() => ({
  scrollY: window.scrollY,
  scale: window.visualViewport?.scale ?? 1,
  events: globalThis.__pongTouchProbe,
}));
report(
  'two-thumb play suppresses page movement and pinch zoom',
  mobileGesture.scrollY === 0 &&
    mobileGesture.scale === 1 &&
    mobileGesture.events.some(event => (
      event.type === 'touchmove' && event.touches === 2 && event.defaultPrevented
    )),
  `scrollY=${mobileGesture.scrollY} scale=${mobileGesture.scale}`
);

await cdp.send('Input.dispatchTouchEvent', {
  type: 'touchMove',
  touchPoints: [
    { x: 40, y: 300, id: 5 },
    { x: 350, y: 400, id: 6 },
  ],
});
await mobile.page.waitForTimeout(INPUT_SETTLE_MS);
paddles = await mobile.page.evaluate(readPaddles);
report(
  'two-thumb movement updates both paddles',
  Math.abs(paddles.left.center - 300) <= PADDLE_POSITION_TOLERANCE &&
    Math.abs(paddles.right.center - 400) <= PADDLE_POSITION_TOLERANCE,
  `leftY=${paddles.left.center} rightY=${paddles.right.center}`
);

await cdp.send('Input.dispatchTouchEvent', {
  type: 'touchMove',
  touchPoints: [
    { x: 300, y: 320, id: 5 },
    { x: 90, y: 380, id: 6 },
  ],
});
await mobile.page.waitForTimeout(INPUT_SETTLE_MS);
paddles = await mobile.page.evaluate(readPaddles);
report(
  'assigned thumbs keep controlling their original paddles after crossing',
  Math.abs(paddles.left.center - 320) <= PADDLE_POSITION_TOLERANCE &&
    Math.abs(paddles.right.center - 380) <= PADDLE_POSITION_TOLERANCE,
  `leftY=${paddles.left.center} rightY=${paddles.right.center}`
);

await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await mobile.page.waitForTimeout(INPUT_SETTLE_MS);
canvas = await mobile.page.evaluate(readCanvas);
report(
  'lifting either thumb pauses the ball and paddles',
  canvas.state === 'paused' && !(await ballPositionChanges(mobile.page)),
  `state=${canvas.state}`
);

await cdp.send('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [
    { x: 40, y: 260, id: 7 },
    { x: 350, y: 440, id: 8 },
  ],
});
await mobile.page.waitForTimeout(INPUT_SETTLE_MS);
canvas = await mobile.page.evaluate(readCanvas);
await mobile.page.waitForTimeout(SERVE_SETTLE_MS);
report(
  'a new two-thumb gesture resumes immediately',
  canvas.state === 'active' && (await ballPositionChanges(mobile.page)),
  `state=${canvas.state}`
);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
report('mobile run has no browser errors', mobile.errors.length === 0, mobile.errors.join(' | '));
await mobile.context.close();

const pinchControl = await createPage({
  viewport: MOBILE_VIEWPORT,
  reducedMotion: 'no-preference',
  hasTouch: true,
  isMobile: true,
});
await pinchControl.page.goto(`${SITE_URL}?animate=false`, { waitUntil: 'domcontentloaded' });
const pinchControlCdp = await pinchControl.context.newCDPSession(pinchControl.page);
await pinchControlCdp.send('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [
    { x: PINCH_LEFT_START_X, y: 250, id: 1 },
    { x: PINCH_RIGHT_START_X, y: 450, id: 2 },
  ],
});
await spreadTouchPair(pinchControlCdp, 1, 2, 250, 450);
const pinchControlScale = await pinchControl.page.evaluate(() => window.visualViewport?.scale ?? 1);
report(
  'pinch probe zooms when Pong is disabled',
  pinchControlScale > 1,
  `scale=${pinchControlScale}`
);
await pinchControlCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
report(
  'pinch control run has no browser errors',
  pinchControl.errors.length === 0,
  pinchControl.errors.join(' | ')
);
await pinchControl.context.close();

await browser.close();
if (failures > 0) {
  console.error(`verify-pong: ${failures} failure(s)`);
  process.exit(1);
}
console.log('verify-pong: all cases passed');
