"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { cn } from "@/lib/utils";
import {
  DEFAULT_IMAGE_OBJECT_POSITION,
  imageObjectPositionCss,
  imageZoom,
  nudgeImageObjectPosition,
  nudgeImageZoom,
  panCoverObjectPosition,
  pointerDistance,
  roundZoom,
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
 * handler is provided, lets the user pan, pinch-zoom, or arrow-nudge the crop.
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
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const lastPointRef = useRef<{ x: number; y: number } | undefined>(undefined);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchStartRef = useRef<{ distance: number; zoom: number } | undefined>(
    undefined,
  );
  const draggingRef = useRef(false);
  const positionRef = useRef(position);
  const [isDragging, setIsDragging] = useState(false);
  const zoom = imageZoom(position);
  const canReposition =
    fit === "cover" && Boolean(onPositionChange) && !disabled;

  useEffect(() => {
    if (!draggingRef.current && !pinchStartRef.current) {
      positionRef.current = position;
    }
  }, [position]);

  function stopPointer(pointerId?: number) {
    if (pointerId !== undefined) {
      pointersRef.current.delete(pointerId);
    } else {
      pointersRef.current.clear();
    }
    if (pointersRef.current.size < 2) {
      pinchStartRef.current = undefined;
    }
    if (pointersRef.current.size === 0) {
      draggingRef.current = false;
      lastPointRef.current = undefined;
      setIsDragging(false);
    }
  }

  function updateFromPan(event: PointerEvent<HTMLDivElement>) {
    const frame = frameRef.current;
    const image = imageRef.current;
    const lastPoint = lastPointRef.current;
    if (!frame || !image || !lastPoint || !onPositionChange) return;

    const rect = frame.getBoundingClientRect();
    const deltaX = event.movementX || event.clientX - lastPoint.x;
    const deltaY = event.movementY || event.clientY - lastPoint.y;
    const next = panCoverObjectPosition({
      position: positionRef.current,
      deltaX,
      deltaY,
      containerWidth: rect.width,
      containerHeight: rect.height,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      zoom: imageZoom(positionRef.current),
    });
    positionRef.current = next;
    lastPointRef.current = { x: event.clientX, y: event.clientY };
    onPositionChange(next);
  }

  function updateFromPinch() {
    if (!onPositionChange) return;
    const points = [...pointersRef.current.values()];
    const pinchStart = pinchStartRef.current;
    if (points.length < 2 || !pinchStart || pinchStart.distance <= 0) return;

    const ratio = pointerDistance(points[0]!, points[1]!) / pinchStart.distance;
    const next = {
      ...positionRef.current,
      zoom: roundZoom(pinchStart.zoom * ratio),
    };
    positionRef.current = next;
    onPositionChange(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!canReposition || !onPositionChange) return;
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      const next = nudgeImageZoom(positionRef.current, "in");
      positionRef.current = next;
      onPositionChange(next);
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      const next = nudgeImageZoom(positionRef.current, "out");
      positionRef.current = next;
      onPositionChange(next);
      return;
    }
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "ArrowUp" &&
      event.key !== "ArrowDown"
    ) {
      return;
    }
    event.preventDefault();
    const next = nudgeImageObjectPosition(positionRef.current, event.key);
    positionRef.current = next;
    onPositionChange(next);
  }

  return (
    <div
      ref={frameRef}
      role="img"
      aria-label={alt}
      data-image-fit={fit}
      data-image-zoom={String(zoom)}
      data-object-position={imageObjectPositionCss(position)}
      tabIndex={canReposition ? 0 : undefined}
      aria-keyshortcuts={
        canReposition ? "ArrowLeft ArrowRight ArrowUp ArrowDown + -" : undefined
      }
      className={cn(
        "relative size-full min-h-0 min-w-0 overflow-hidden",
        canReposition && "touch-none select-none",
        canReposition && (isDragging ? "cursor-grabbing" : "cursor-grab"),
        className,
      )}
      onPointerDown={(event) => {
        if (!canReposition) return;
        pointersRef.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        if (pointersRef.current.size >= 2) {
          const [first, second] = [...pointersRef.current.values()];
          if (first && second) {
            pinchStartRef.current = {
              distance: pointerDistance(first, second),
              zoom: imageZoom(positionRef.current),
            };
          }
          draggingRef.current = false;
          lastPointRef.current = undefined;
          setIsDragging(false);
          return;
        }
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        if (event.pointerType === "mouse") {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        lastPointRef.current = { x: event.clientX, y: event.clientY };
        draggingRef.current = true;
        setIsDragging(true);
      }}
      onPointerMove={(event) => {
        if (!canReposition) return;
        if (pointersRef.current.has(event.pointerId)) {
          pointersRef.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          });
        }
        if (pointersRef.current.size >= 2) {
          updateFromPinch();
          return;
        }
        if (!draggingRef.current) return;
        updateFromPan(event);
      }}
      onPointerUp={(event) => stopPointer(event.pointerId)}
      onPointerCancel={(event) => stopPointer(event.pointerId)}
      onLostPointerCapture={() => stopPointer()}
      onKeyDown={handleKeyDown}
    >
      {/* Storybook prototypes preview object URLs and arbitrary remote URLs. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        src={src}
        alt=""
        draggable={false}
        aria-hidden="true"
        className={cn(
          "pointer-events-none size-full select-none",
          fit === "cover" ? "object-cover" : "object-contain",
        )}
        style={{
          objectPosition: imageObjectPositionCss(position),
          transform: `scale(${zoom})`,
          transformOrigin: imageObjectPositionCss(position),
        }}
      />
    </div>
  );
}
