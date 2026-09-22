export const MIN_IMAGE_ZOOM = 1;
export const MAX_IMAGE_ZOOM = 8;

export interface ImagePoint {
  x: number;
  y: number;
}

export interface ImageSize {
  width: number;
  height: number;
}

export interface ImageView extends ImagePoint {
  scale: number;
}

export function fitImage(image: ImageSize, viewport: ImageSize): ImageSize {
  const scale = Math.min(viewport.width / image.width, viewport.height / image.height);
  return { width: image.width * scale, height: image.height * scale };
}

export function boundImageView(view: ImageView, image: ImageSize, viewport: ImageSize): ImageView {
  const scale = Math.max(MIN_IMAGE_ZOOM, Math.min(MAX_IMAGE_ZOOM, view.scale));
  const maxX = Math.max(0, (image.width * scale - viewport.width) / 2);
  const maxY = Math.max(0, (image.height * scale - viewport.height) / 2);
  return {
    scale,
    x: maxX === 0 ? 0 : Math.max(-maxX, Math.min(maxX, view.x)),
    y: maxY === 0 ? 0 : Math.max(-maxY, Math.min(maxY, view.y)),
  };
}

export function zoomImageAt(view: ImageView, scale: number, anchor: ImagePoint): ImageView {
  const nextScale = Math.max(MIN_IMAGE_ZOOM, Math.min(MAX_IMAGE_ZOOM, scale));
  const ratio = nextScale / view.scale;
  return {
    scale: nextScale,
    x: anchor.x - (anchor.x - view.x) * ratio,
    y: anchor.y - (anchor.y - view.y) * ratio,
  };
}
