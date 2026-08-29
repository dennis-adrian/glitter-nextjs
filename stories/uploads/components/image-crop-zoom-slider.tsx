"use client";

import { MinusIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
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
 * Horizontal zoom control used under a cover crop. Built from the shared
 * Button and Slider so it matches the rest of the app.
 */
export function ImageCropZoomSlider({
  value,
  onChange,
  disabled = false,
  label = "Zoom",
}: ImageCropZoomSliderProps) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0 touch-manipulation"
          aria-label="Alejar"
          disabled={disabled || value <= MIN_IMAGE_ZOOM}
          onClick={() => onChange(roundZoom(value - IMAGE_ZOOM_STEP))}
        >
          <MinusIcon className="size-4" aria-hidden="true" />
        </Button>
        <Slider
          className="w-full"
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
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0 touch-manipulation"
          aria-label="Acercar"
          disabled={disabled || value >= MAX_IMAGE_ZOOM}
          onClick={() => onChange(roundZoom(value + IMAGE_ZOOM_STEP))}
        >
          <PlusIcon className="size-4" aria-hidden="true" />
        </Button>
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
