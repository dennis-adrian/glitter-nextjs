export type ImageFit = "contain" | "cover";

export type ImageObjectPosition = {
  x: number;
  y: number;
  /** Extra magnification on top of cover. `1` fills the frame. */
  zoom?: number;
};

export const DEFAULT_IMAGE_OBJECT_POSITION: ImageObjectPosition = {
  x: 50,
  y: 50,
  zoom: 1,
};

export const IMAGE_POSITION_KEYBOARD_STEP = 5;
export const MIN_IMAGE_ZOOM = 1;
export const MAX_IMAGE_ZOOM = 3;
export const DEFAULT_IMAGE_ZOOM = 1;
export const IMAGE_ZOOM_STEP = 0.1;

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function roundPercent(value: number): number {
  return Math.round(clampPercent(value) * 100) / 100;
}

export function clampZoom(value: number): number {
  return Math.min(MAX_IMAGE_ZOOM, Math.max(MIN_IMAGE_ZOOM, value));
}

export function roundZoom(value: number): number {
  return Math.round(clampZoom(value) * 100) / 100;
}

export function imageZoom(
  position: ImageObjectPosition = DEFAULT_IMAGE_OBJECT_POSITION,
): number {
  return roundZoom(position.zoom ?? DEFAULT_IMAGE_ZOOM);
}

export function formatImageZoom(zoom: number): string {
  return `${roundZoom(zoom).toFixed(1).replace(".", ",")}×`;
}

export function imageObjectPositionCss(
  position: ImageObjectPosition = DEFAULT_IMAGE_OBJECT_POSITION,
): string {
  return `${position.x}% ${position.y}%`;
}

export function isDefaultImageObjectPosition(
  position: ImageObjectPosition,
): boolean {
  return (
    position.x === DEFAULT_IMAGE_OBJECT_POSITION.x &&
    position.y === DEFAULT_IMAGE_OBJECT_POSITION.y &&
    imageZoom(position) === DEFAULT_IMAGE_ZOOM
  );
}

/**
 * Translate a pointer drag into object-position percentages for `object-fit:
 * cover`. Positive deltas move the image with the pointer, revealing the
 * opposite edge of the source. `zoom` enlarges overflow so the same finger
 * movement tracks the magnified bitmap.
 */
export function panCoverObjectPosition({
  position,
  deltaX,
  deltaY,
  containerWidth,
  containerHeight,
  naturalWidth,
  naturalHeight,
  zoom = imageZoom(position),
}: {
  position: ImageObjectPosition;
  deltaX: number;
  deltaY: number;
  containerWidth: number;
  containerHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  zoom?: number;
}): ImageObjectPosition {
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    return position;
  }

  const scale =
    Math.max(containerWidth / naturalWidth, containerHeight / naturalHeight) *
    clampZoom(zoom);
  const scaledWidth = naturalWidth * scale;
  const scaledHeight = naturalHeight * scale;
  const overflowX = scaledWidth - containerWidth;
  const overflowY = scaledHeight - containerHeight;

  let nextX = position.x;
  let nextY = position.y;

  if (overflowX > 0.5) {
    const minOffsetX = containerWidth - scaledWidth;
    const offsetX = minOffsetX * (position.x / 100) + deltaX;
    const clampedOffsetX = Math.min(0, Math.max(minOffsetX, offsetX));
    nextX = roundPercent((clampedOffsetX / minOffsetX) * 100);
  }

  if (overflowY > 0.5) {
    const minOffsetY = containerHeight - scaledHeight;
    const offsetY = minOffsetY * (position.y / 100) + deltaY;
    const clampedOffsetY = Math.min(0, Math.max(minOffsetY, offsetY));
    nextY = roundPercent((clampedOffsetY / minOffsetY) * 100);
  }

  return { ...position, x: nextX, y: nextY, zoom: clampZoom(zoom) };
}

export function nudgeImageObjectPosition(
  position: ImageObjectPosition,
  key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown",
  step = IMAGE_POSITION_KEYBOARD_STEP,
): ImageObjectPosition {
  const next = { ...position };
  if (key === "ArrowRight") next.x -= step;
  if (key === "ArrowLeft") next.x += step;
  if (key === "ArrowDown") next.y -= step;
  if (key === "ArrowUp") next.y += step;
  return {
    ...position,
    x: roundPercent(next.x),
    y: roundPercent(next.y),
  };
}

export function nudgeImageZoom(
  position: ImageObjectPosition,
  direction: "in" | "out",
  step = IMAGE_ZOOM_STEP,
): ImageObjectPosition {
  const delta = direction === "in" ? step : -step;
  return {
    ...position,
    zoom: roundZoom(imageZoom(position) + delta),
  };
}

export function pointerDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
