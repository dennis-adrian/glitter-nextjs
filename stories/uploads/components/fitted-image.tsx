"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

import { cn } from "@/lib/utils";
import {
  DEFAULT_IMAGE_OBJECT_POSITION,
  imageObjectPositionCss,
  nudgeImageObjectPosition,
  panCoverObjectPosition,
  type ImageFit,
  type ImageObjectPosition,
} from "@/stories/uploads/components/image-object-position";

type FittedImageProps = {
  src: string;
  alt: string;
  fit?: ImageFit;
  position?: ImageObjectPosition;
  onPositionChange?: (position: ImageObjectPosition) => void;
  className?: string;
  disabled?: boolean;
};

/**
 * Renders an image inside a clipped frame. `contain` (default) letterboxes so
 * the whole image is visible. `cover` fills the frame and, when a position
 * handler is provided, lets the user pan the crop with pointer or arrows.
 */
export function FittedImage({
  src,
  alt,
  fit = "contain",
  position = DEFAULT_IMAGE_OBJECT_POSITION,
  onPositionChange,
  className,
  disabled = false,
}: FittedImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const lastPointRef = useRef<{ x: number; y: number } | undefined>(undefined);
  const draggingRef = useRef(false);
  const positionRef = useRef(position);
  const [isDragging, setIsDragging] = useState(false);
  const canReposition =
    fit === "cover" && Boolean(onPositionChange) && !disabled;

  useEffect(() => {
    if (!draggingRef.current) {
      positionRef.current = position;
    }
  }, [position]);

  function stopDragging() {
    draggingRef.current = false;
    lastPointRef.current = undefined;
    setIsDragging(false);
  }

  function updateFromPointer(event: PointerEvent<HTMLImageElement>) {
    const image = imageRef.current;
    const lastPoint = lastPointRef.current;
    if (!image || !lastPoint || !onPositionChange) return;

    const rect = image.getBoundingClientRect();
    const next = panCoverObjectPosition({
      position: positionRef.current,
      deltaX: event.clientX - lastPoint.x,
      deltaY: event.clientY - lastPoint.y,
      containerWidth: rect.width,
      containerHeight: rect.height,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    });
    positionRef.current = next;
    lastPointRef.current = { x: event.clientX, y: event.clientY };
    onPositionChange(next);
  }

  return (
    // Storybook prototypes preview object URLs and arbitrary remote URLs.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imageRef}
      src={src}
      alt={alt}
      draggable={false}
      data-image-fit={fit}
      tabIndex={canReposition ? 0 : undefined}
      aria-keyshortcuts={
        canReposition ? "ArrowLeft ArrowRight ArrowUp ArrowDown" : undefined
      }
      data-object-position={imageObjectPositionCss(position)}
      title={
        canReposition
          ? `Recorte ${Math.round(position.x)}% horizontal, ${Math.round(position.y)}% vertical. Arrastra la imagen o usa las flechas para reposicionar.`
          : undefined
      }
      className={cn(
        "size-full select-none",
        fit === "cover" ? "object-cover" : "object-contain",
        canReposition && "touch-none",
        canReposition && (isDragging ? "cursor-grabbing" : "cursor-grab"),
        className,
      )}
      style={{ objectPosition: imageObjectPositionCss(position) }}
      onPointerDown={(event) => {
        if (!canReposition || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        lastPointRef.current = { x: event.clientX, y: event.clientY };
        draggingRef.current = true;
        setIsDragging(true);
      }}
      onPointerMove={(event) => {
        if (!draggingRef.current) return;
        updateFromPointer(event);
      }}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onLostPointerCapture={stopDragging}
      onKeyDown={(event) => {
        if (!canReposition || !onPositionChange) return;
        if (
          event.key !== "ArrowLeft" &&
          event.key !== "ArrowRight" &&
          event.key !== "ArrowUp" &&
          event.key !== "ArrowDown"
        ) {
          return;
        }
        event.preventDefault();
        onPositionChange(nudgeImageObjectPosition(position, event.key));
      }}
    />
  );
}
