import { describe, expect, it } from 'vitest';
import {
  ANIMATION_MODE,
  ANIMATION_MODE_ATTRIBUTE,
  animationIsForced,
  motionShouldReduce,
} from '../src/lib/animation-preference';

function rootWithMode(mode: string | null): HTMLElement {
  return {
    getAttribute(name: string) {
      return name === ANIMATION_MODE_ATTRIBUTE ? mode : null;
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
