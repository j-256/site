import {
  MAX_IMAGE_ZOOM,
  MIN_IMAGE_ZOOM,
  boundImageView,
  fitImage,
  zoomImageAt,
  type ImagePoint,
  type ImageView,
} from '../lib/image-viewport';

const ZOOM_STEP = 1.5;
const FIT_VIEW: Readonly<ImageView> = Object.freeze({ scale: MIN_IMAGE_ZOOM, x: 0, y: 0 });
const IMAGE_CENTER: Readonly<ImagePoint> = Object.freeze({ x: 0, y: 0 });

export function initProjectViewer(dialog: HTMLDialogElement): void {
  const stage = dialog.querySelector<HTMLElement>('[data-viewer-stage]')!;
  const image = dialog.querySelector<HTMLImageElement>('[data-viewer-image]')!;
  const name = dialog.querySelector<HTMLElement>('[data-viewer-name]')!;
  const status = dialog.querySelector<HTMLElement>('[data-viewer-status]')!;
  const close = dialog.querySelector<HTMLButtonElement>('[data-viewer-close]')!;
  const zoomIn = dialog.querySelector<HTMLButtonElement>('[data-viewer-zoom-in]')!;
  const zoomOut = dialog.querySelector<HTMLButtonElement>('[data-viewer-zoom-out]')!;
  const fit = dialog.querySelector<HTMLButtonElement>('[data-viewer-fit]')!;
  const zoomLevel = dialog.querySelector<HTMLOutputElement>('[data-viewer-zoom]')!;
  const pointers = new Map<number, ImagePoint>();
  let opener: HTMLButtonElement | null = null;
  let view: ImageView = { ...FIT_VIEW };
  let fitted = { width: 0, height: 0 };
  let gesture: { view: ImageView; center: ImagePoint; distance: number } | null = null;
  let previousOverflow = '';
  let previousScrollY = 0;

  function viewport() {
    return { width: stage.clientWidth, height: stage.clientHeight };
  }

  function render(): void {
    const focusedControl = document.activeElement;
    view = boundImageView(view, fitted, viewport());
    image.style.transform = `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    zoomLevel.value = `${Math.round(view.scale * 100)}%`;
    const ready = dialog.hasAttribute('data-ready');
    zoomIn.disabled = !ready || view.scale >= MAX_IMAGE_ZOOM;
    zoomOut.disabled = !ready || view.scale <= MIN_IMAGE_ZOOM;
    fit.disabled = !ready || view.scale === MIN_IMAGE_ZOOM;
    if (dialog.open && focusedControl instanceof HTMLButtonElement && focusedControl.disabled) {
      close.focus({ preventScroll: true });
    }
  }

  function fitToStage(): void {
    if (!dialog.open || !image.naturalWidth) return;
    fitted = fitImage({ width: image.naturalWidth, height: image.naturalHeight }, viewport());
    image.style.width = `${fitted.width}px`;
    image.style.height = `${fitted.height}px`;
    view = { ...FIT_VIEW };
    pointers.clear();
    gesture = null;
    render();
  }

  async function imageReady(): Promise<void> {
    if (!dialog.open || !image.complete || !image.naturalWidth) return;
    const source = image.src;
    try {
      await image.decode();
    } catch {
      return;
    }
    if (!dialog.open || image.src !== source) return;
    dialog.setAttribute('data-ready', '');
    status.textContent = '';
    fitToStage();
  }

  function openViewer(button: HTMLButtonElement): void {
    if (dialog.open) return;
    const link = button.closest('.project-row')?.querySelector<HTMLAnchorElement>('[data-project-preview-link]');
    if (!link?.dataset.previewSrc || !link.dataset.previewName) return;
    opener = button;
    previousOverflow = document.documentElement.style.overflow;
    previousScrollY = window.scrollY;
    document.documentElement.style.overflow = 'hidden';
    dialog.removeAttribute('data-ready');
    name.textContent = link.dataset.previewName;
    image.alt = `${link.dataset.previewName} screenshot`;
    status.textContent = 'Loading screenshot...';
    view = { ...FIT_VIEW };
    render();
    dialog.showModal();
    close.focus({ preventScroll: true });
    image.removeAttribute('src');
    image.src = link.dataset.previewSrc;
    imageReady();
  }

  document.querySelectorAll<HTMLButtonElement>('[data-project-viewer-open]').forEach(button => {
    button.hidden = false;
    button.addEventListener('click', () => openViewer(button));
  });

  image.addEventListener('load', imageReady);
  image.addEventListener('error', () => {
    if (!dialog.open) return;
    dialog.removeAttribute('data-ready');
    status.textContent = 'Screenshot unavailable. Close and reopen to retry.';
    render();
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    document.documentElement.style.overflow = previousOverflow;
    pointers.clear();
    gesture = null;
    opener?.focus({ preventScroll: true });
    window.scrollTo({ top: previousScrollY, behavior: 'instant' });
  });
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key !== 'Tab') return;
    const buttons = dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  });
  dialog.addEventListener('keyup', event => event.stopPropagation());
  for (const event of ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'pointermove']) {
    dialog.addEventListener(event, event => event.stopPropagation(), { passive: true });
  }
  new ResizeObserver(fitToStage).observe(stage);

  function zoom(scale: number): void {
    view = zoomImageAt(view, scale, IMAGE_CENTER);
    render();
  }

  zoomIn.addEventListener('click', () => zoom(view.scale * ZOOM_STEP));
  zoomOut.addEventListener('click', () => zoom(view.scale / ZOOM_STEP));
  fit.addEventListener('click', fitToStage);

  function pointerPoint(event: PointerEvent): ImagePoint {
    const rect = stage.getBoundingClientRect();
    return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
  }

  function pointerGeometry() {
    const [first, second = first] = [...pointers.values()];
    return {
      center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
      distance: Math.hypot(first.x - second.x, first.y - second.y),
    };
  }

  function beginGesture(): void {
    gesture = pointers.size ? { view: { ...view }, ...pointerGeometry() } : null;
  }

  stage.addEventListener('pointerdown', event => {
    if (!dialog.hasAttribute('data-ready') || event.button !== 0) return;
    pointers.set(event.pointerId, pointerPoint(event));
    stage.setPointerCapture(event.pointerId);
    beginGesture();
  });
  stage.addEventListener('pointermove', event => {
    if (!gesture || !pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, pointerPoint(event));
    const current = pointerGeometry();
    const scale = gesture.distance ? gesture.view.scale * current.distance / gesture.distance : gesture.view.scale;
    view = zoomImageAt(gesture.view, scale, gesture.center);
    view.x += current.center.x - gesture.center.x;
    view.y += current.center.y - gesture.center.y;
    render();
  });
  function endPointer(event: PointerEvent): void {
    if (!pointers.delete(event.pointerId)) return;
    beginGesture();
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  stage.addEventListener('lostpointercapture', endPointer);
}
