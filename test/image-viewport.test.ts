import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_ZOOM, boundImageView, fitImage, zoomImageAt } from '../src/lib/image-viewport';

describe('screenshot viewport', () => {
  it('fits landscape and portrait images without cropping or stretching', () => {
    expect(fitImage({ width: 1440, height: 960 }, { width: 360, height: 700 })).toEqual({ width: 360, height: 240 });
    expect(fitImage({ width: 800, height: 1600 }, { width: 600, height: 300 })).toEqual({ width: 150, height: 300 });
  });

  it('keeps the image point under a pinch anchor stationary', () => {
    const view = { scale: 2, x: -30, y: 40 };
    const anchor = { x: 60, y: -20 };
    const zoomed = zoomImageAt(view, 3, anchor);
    expect((anchor.x - zoomed.x) / zoomed.scale).toBe((anchor.x - view.x) / view.scale);
    expect((anchor.y - zoomed.y) / zoomed.scale).toBe((anchor.y - view.y) / view.scale);
  });

  it('limits zoom before calculating the new pan position', () => {
    expect(zoomImageAt({ scale: 1, x: 0, y: 0 }, 100, { x: 10, y: 0 })).toEqual({ scale: MAX_IMAGE_ZOOM, x: -70, y: 0 });
    expect(zoomImageAt({ scale: 2, x: 10, y: 20 }, 0.1, { x: 0, y: 0 })).toEqual({ scale: 1, x: 5, y: 10 });
  });

  it('prevents dragging beyond image edges while centering a letterboxed axis', () => {
    const view = boundImageView({ scale: 2, x: 500, y: -500 }, { width: 360, height: 240 }, { width: 360, height: 700 });
    expect(view).toEqual({ scale: 2, x: 180, y: 0 });
    expect(boundImageView({ scale: 1, x: -200, y: 200 }, { width: 360, height: 240 }, { width: 360, height: 700 })).toEqual({ scale: 1, x: 0, y: 0 });
  });
});
