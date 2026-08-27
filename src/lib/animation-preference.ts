export const ANIMATION_QUERY_PARAMETER = 'animate';
export const ANIMATION_MODE_ATTRIBUTE = 'data-animation-mode';
export const ANIMATION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)';
export const ANIMATION_DISABLE_VALUES = Object.freeze(['0', 'false']);

export const ANIMATION_MODE = Object.freeze({
  DISABLE: 'disable',
  FORCE: 'force',
  SYSTEM: 'system',
} as const);

export function animationIsForced(root: HTMLElement = document.documentElement): boolean {
  return root.getAttribute(ANIMATION_MODE_ATTRIBUTE) === ANIMATION_MODE.FORCE;
}

export function motionShouldReduce(
  mediaQuery: MediaQueryList = window.matchMedia(ANIMATION_MEDIA_QUERY),
  root: HTMLElement = document.documentElement
): boolean {
  const mode = root.getAttribute(ANIMATION_MODE_ATTRIBUTE);
  if (mode === ANIMATION_MODE.DISABLE) return true;
  if (mode === ANIMATION_MODE.FORCE) return false;
  return mediaQuery.matches;
}
