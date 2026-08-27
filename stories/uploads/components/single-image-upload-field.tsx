"use client";

import { ImageIcon, Loader2Icon, UploadIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/app/components/ui/button";
import { Progress } from "@/app/components/ui/progress";
import { cn } from "@/lib/utils";
import { FittedImage } from "@/stories/uploads/components/fitted-image";
import { ImageCropZoomSlider } from "@/stories/uploads/components/image-crop-zoom-slider";
import {
  DEFAULT_IMAGE_OBJECT_POSITION,
  imageZoom,
  roundZoom,
  type ImageFit,
  type ImageObjectPosition,
} from "@/stories/uploads/components/image-object-position";
import { ImagePreviewRemoveButton } from "@/stories/uploads/components/image-preview-remove-button";
import {
  DEFAULT_MAX_IMAGE_SIZE,
  formatFileSize,
  type ImageUploadAdapter,
  type UploadedImage,
  validateImage,
} from "@/stories/uploads/components/upload-types";

type SingleImageUploadFieldProps = {
  value?: UploadedImage | null;
  onChange: (image: UploadedImage | null) => void;
  upload: ImageUploadAdapter;
  label?: string;
  description?: string;
  emptyLabel?: string;
  confirmLabel?: string;
  accept?: string;
  maxSize?: number;
  previewShape?: "circle" | "landscape" | "square";
  /**
   * How the image sits in the preview frame. `contain` (default) shows the
   * whole image. `cover` fills the frame — use it for avatars and cropped
   * product shots, then pan and zoom to choose the visible area.
   */
  fit?: ImageFit;
  disabled?: boolean;
};

const previewColumnClasses = {
  circle: "w-48",
  landscape: "w-full",
  square: "w-48",
} as const;

const previewShapeClasses = {
  circle: "aspect-square w-full rounded-full",
  landscape: "aspect-video w-full rounded-xl",
  square: "aspect-square w-full rounded-xl",
} as const;

/**
 * Staged single-image field for avatars, logos, and artwork. Selection stays
 * local until the user confirms with Subir; clear via the overlay X, then pick
 * again. The upload transport is injected and the value is controlled.
 */
export function SingleImageUploadField({
  value,
  onChange,
  upload,
  label = "Imagen",
  description = "JPG, PNG o WebP",
  emptyLabel = "Todavía no seleccionaste una imagen",
  confirmLabel = "Subir imagen",
  accept = "image/*",
  maxSize = DEFAULT_MAX_IMAGE_SIZE,
  previewShape = "square",
  fit = "contain",
  disabled = false,
}: SingleImageUploadFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File>();
  const [localPreview, setLocalPreview] = useState<string>();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [isUploading, setIsUploading] = useState(false);
  const [draftPosition, setDraftPosition] = useState<ImageObjectPosition>(
    value?.objectPosition ?? DEFAULT_IMAGE_OBJECT_POSITION,
  );
  const draftPositionRef = useRef(draftPosition);
  draftPositionRef.current = draftPosition;

  // Reset the draft crop when a different uploaded image is set, not when the
  // user pans the current one (that only changes objectPosition).
  useEffect(() => {
    if (selectedFile) return;
    setDraftPosition(value?.objectPosition ?? DEFAULT_IMAGE_OBJECT_POSITION);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identity is value.id
  }, [value?.id, selectedFile]);

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  function updatePosition(next: ImageObjectPosition) {
    setDraftPosition(next);
    draftPositionRef.current = next;
    if (value && !selectedFile) {
      onChange({ ...value, objectPosition: next });
    }
  }

  function clearSelection() {
    if (localPreview) URL.revokeObjectURL(localPreview);
    setSelectedFile(undefined);
    setLocalPreview(undefined);
    setProgress(0);
    setError(undefined);
    setDraftPosition(DEFAULT_IMAGE_OBJECT_POSITION);
    draftPositionRef.current = DEFAULT_IMAGE_OBJECT_POSITION;
    if (inputRef.current) inputRef.current.value = "";
  }

  function chooseFile(file: File) {
    const validationError = validateImage(file, maxSize);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (localPreview) URL.revokeObjectURL(localPreview);
    setError(undefined);
    setProgress(0);
    setDraftPosition(DEFAULT_IMAGE_OBJECT_POSITION);
    draftPositionRef.current = DEFAULT_IMAGE_OBJECT_POSITION;
    setSelectedFile(file);
    setLocalPreview(URL.createObjectURL(file));
    if (inputRef.current) inputRef.current.value = "";
  }

  async function confirmUpload() {
    if (!selectedFile) return;

    setIsUploading(true);
    setError(undefined);
    setProgress(0);
    try {
      const [uploaded] = await upload([selectedFile], {
        onProgress: setProgress,
      });
      if (!uploaded) {
        setError("La carga no devolvió ninguna imagen.");
        return;
      }
      onChange({
        ...uploaded,
        objectPosition: draftPositionRef.current,
      });
      clearSelection();
    } catch {
      setError("No se pudo subir la imagen. Intentá de nuevo.");
    } finally {
      setIsUploading(false);
      setProgress(0);
    }
  }

  const previewUrl = localPreview ?? value?.url;
  const position = selectedFile
    ? draftPosition
    : (value?.objectPosition ?? draftPosition);
  const canClear = Boolean(value || selectedFile) && !isUploading && !disabled;
  const isEmpty = !value && !selectedFile;

  return (
    <section className="grid w-full gap-3" aria-labelledby={`${inputId}-label`}>
      <div>
        <h3 id={`${inputId}-label`} className="text-sm font-semibold">
          {label}
        </h3>
        <p className="text-xs text-muted-foreground">
          {description} · máximo {formatFileSize(maxSize)}
        </p>
      </div>

      <div
        className={cn(
          "grid max-w-full gap-3",
          previewColumnClasses[previewShape],
        )}
      >
        <div className="relative">
          <div
            className={cn(
              "relative grid place-items-center overflow-hidden border border-dashed bg-muted/50",
              previewShapeClasses[previewShape],
            )}
          >
            {previewUrl ? (
              <FittedImage
                src={previewUrl}
                alt={`Vista previa de ${label.toLowerCase()}`}
                fit={fit}
                position={position}
                onPositionChange={fit === "cover" ? updatePosition : undefined}
                disabled={disabled || isUploading}
                className="absolute inset-0"
              />
            ) : (
              <button
                type="button"
                className="flex size-full touch-manipulation flex-col items-center justify-center gap-1.5 p-4 text-center text-xs leading-snug text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-not-allowed"
                disabled={disabled || isUploading}
                aria-label={`Seleccionar ${label.toLowerCase()} desde la vista previa`}
                onClick={() => inputRef.current?.click()}
              >
                <ImageIcon className="size-8 shrink-0" aria-hidden="true" />
                <span>{emptyLabel}</span>
              </button>
            )}
            {isUploading ? (
              <div className="absolute inset-x-3 bottom-3 z-10 rounded-md bg-background/95 p-2 shadow">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1">
                    <Loader2Icon className="size-3 animate-spin" />
                    Subiendo
                  </span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-1.5" />
              </div>
            ) : null}
          </div>
          {canClear ? (
            <ImagePreviewRemoveButton
              label={`Quitar ${label.toLowerCase()}`}
              onClick={() => {
                clearSelection();
                onChange(null);
              }}
            />
          ) : null}
        </div>
        {previewUrl && fit === "cover" ? (
          <div className="grid gap-2">
            <ImageCropZoomSlider
              value={imageZoom(position)}
              disabled={disabled || isUploading}
              onChange={(zoom) =>
                updatePosition({ ...position, zoom: roundZoom(zoom) })
              }
            />
            <p className="text-xs text-muted-foreground">
              Arrastrá o pellizcá la imagen. Usá el control para acercar.
            </p>
          </div>
        ) : null}

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          className="sr-only"
          disabled={disabled || isUploading}
          aria-label={`Seleccionar ${label.toLowerCase()}`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) chooseFile(file);
          }}
        />

        {isEmpty ? (
          <div className="grid w-full">
            <Button
              type="button"
              className="h-auto min-h-11 w-full justify-center gap-2 whitespace-normal touch-manipulation"
              disabled={disabled || isUploading}
              onClick={() => inputRef.current?.click()}
            >
              <UploadIcon className="size-4 shrink-0" aria-hidden="true" />
              Seleccionar imagen
            </Button>
          </div>
        ) : null}

        {selectedFile ? (
          <div className="grid w-full gap-1.5">
            <p className="truncate text-center text-xs text-muted-foreground">
              {selectedFile.name}
            </p>
            <Button
              type="button"
              className="h-auto min-h-11 w-full justify-center gap-2 whitespace-normal touch-manipulation"
              disabled={disabled || isUploading}
              onClick={() => void confirmUpload()}
            >
              {isUploading ? (
                <Loader2Icon
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <UploadIcon className="size-4 shrink-0" aria-hidden="true" />
              )}
              {isUploading ? "Subiendo..." : confirmLabel}
            </Button>
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
