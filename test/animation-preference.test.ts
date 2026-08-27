import { describe, expect, it } from 'vitest';
import {
  ANIMATION_MODE,
  ANIMATION_MODE_ATTRIBUTE,
  animationIsForced,
  forceAnimation,
  motionShouldReduce,
} from '../src/lib/animation-preference';

function rootWithMode(mode: string | null): HTMLElement {
  let currentMode = mode;
  return {
    getAttribute(name: string) {
      return name === ANIMATION_MODE_ATTRIBUTE ? currentMode : null;
    },
    setAttribute(name: string, value: string) {
      if (name === ANIMATION_MODE_ATTRIBUTE) currentMode = value;
    },
  } as HTMLElement;
}

function mediaPreference(matches: boolean): MediaQueryList {
  return { matches } as MediaQueryList;
}

describe('animation preference', () => {
  it('recognizes the force mode written by the synchronous query resolver', () => {
    expect(animationIsForced(rootWithMode(ANIMATION_MODE.FORCE))).toBe(true);
    expect(animationIsForced(rootWithMode(ANIMATION_MODE.SYSTEM))).toBe(false);
  });

  it('forces animation without overriding an explicit disable mode', () => {
    const systemRoot = rootWithMode(ANIMATION_MODE.SYSTEM);
    const disabledRoot = rootWithMode(ANIMATION_MODE.DISABLE);

    expect(forceAnimation(systemRoot)).toBe(true);
    expect(animationIsForced(systemRoot)).toBe(true);
    expect(forceAnimation(disabledRoot)).toBe(false);
    expect(animationIsForced(disabledRoot)).toBe(false);
  });

  it('uses the reduced-motion preference in system mode', () => {
    expect(motionShouldReduce(mediaPreference(true), rootWithMode(ANIMATION_MODE.SYSTEM))).toBe(true);
    expect(motionShouldReduce(mediaPreference(false), rootWithMode(ANIMATION_MODE.SYSTEM))).toBe(false);
  });

  it('ignores reduced motion only when animation is forced', () => {
    expect(motionShouldReduce(mediaPreference(true), rootWithMode(ANIMATION_MODE.FORCE))).toBe(false);
  });

  it('disables motion regardless of the system preference', () => {
    expect(motionShouldReduce(mediaPreference(false), rootWithMode(ANIMATION_MODE.DISABLE))).toBe(true);
  });
});
