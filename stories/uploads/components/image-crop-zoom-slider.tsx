"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import { MinusIcon, PlusIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  formatImageZoom,
  IMAGE_ZOOM_STEP,
  MAX_IMAGE_ZOOM,
  MIN_IMAGE_ZOOM,
  roundZoom,
} from "@/stories/uploads/components/image-object-position";

type ImageCropZoomSliderProps = {
  value: number;
  onChange: (zoom: number) => void;
  disabled?: boolean;
  label?: string;
};

/**
 * Horizontal zoom control used under a cover crop. Large +/- hit targets and
 * thumb work for mouse and for a thumb on a phone.
 */
export function ImageCropZoomSlider({
  value,
  onChange,
  disabled = false,
  label = "Zoom",
}: ImageCropZoomSliderProps) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground touch-manipulation hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          aria-label="Alejar"
          disabled={disabled || value <= MIN_IMAGE_ZOOM}
          onClick={() => onChange(roundZoom(value - IMAGE_ZOOM_STEP))}
        >
          <MinusIcon className="size-4" aria-hidden="true" />
        </button>
        <SliderPrimitive.Root
          className={cn(
            "relative flex w-full touch-none select-none items-center py-2",
            disabled && "pointer-events-none opacity-50",
          )}
          min={MIN_IMAGE_ZOOM}
          max={MAX_IMAGE_ZOOM}
          step={IMAGE_ZOOM_STEP}
          value={[value]}
          disabled={disabled}
          aria-label={label}
          aria-valuetext={formatImageZoom(value)}
          onValueChange={([next]) => {
            if (typeof next === "number") onChange(roundZoom(next));
          }}
        >
          <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
            <SliderPrimitive.Range className="absolute h-full bg-primary" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb className="block size-8 rounded-full border-2 border-primary bg-background shadow-md ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none" />
        </SliderPrimitive.Root>
        <button
          type="button"
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground touch-manipulation hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          aria-label="Acercar"
          disabled={disabled || value >= MAX_IMAGE_ZOOM}
          onClick={() => onChange(roundZoom(value + IMAGE_ZOOM_STEP))}
        >
          <PlusIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
      <p
        className="text-center text-xs text-muted-foreground"
        aria-live="polite"
      >
        {label} {formatImageZoom(value)}
      </p>
    </div>
  );
}
