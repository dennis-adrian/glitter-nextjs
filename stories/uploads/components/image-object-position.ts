export type ImageFit = "contain" | "cover";

export type ImageObjectPosition = {
  x: number;
  y: number;
};

export const DEFAULT_IMAGE_OBJECT_POSITION: ImageObjectPosition = {
  x: 50,
  y: 50,
};

export const IMAGE_POSITION_KEYBOARD_STEP = 5;

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function roundPercent(value: number): number {
  return Math.round(clampPercent(value) * 100) / 100;
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
    position.y === DEFAULT_IMAGE_OBJECT_POSITION.y
  );
}

/**
 * Translate a pointer drag into object-position percentages for `object-fit:
 * cover`. Positive deltas move the image with the pointer, revealing the
 * opposite edge of the source.
 */
export function panCoverObjectPosition({
  position,
  deltaX,
  deltaY,
  containerWidth,
  containerHeight,
  naturalWidth,
  naturalHeight,
}: {
  position: ImageObjectPosition;
  deltaX: number;
  deltaY: number;
  containerWidth: number;
  containerHeight: number;
  naturalWidth: number;
  naturalHeight: number;
}): ImageObjectPosition {
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    return position;
  }

  const scale = Math.max(
    containerWidth / naturalWidth,
    containerHeight / naturalHeight,
  );
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

  return { x: nextX, y: nextY };
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
    x: roundPercent(next.x),
    y: roundPercent(next.y),
  };
}
