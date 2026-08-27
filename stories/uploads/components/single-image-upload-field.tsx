"use client";

import { ImageIcon, Loader2Icon, UploadIcon, XIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/app/components/ui/button";
import { Progress } from "@/app/components/ui/progress";
import { cn } from "@/lib/utils";
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
  accept?: string;
  maxSize?: number;
  previewShape?: "circle" | "landscape" | "square";
  disabled?: boolean;
};

const previewShapeClasses = {
  circle: "aspect-square w-32 rounded-full",
  landscape: "aspect-video w-full rounded-xl",
  square: "aspect-square w-48 rounded-xl",
} as const;

/**
 * Immediate single-image upload for avatars, logos, artwork, and generic
 * image fields. The upload transport is injected and the value is controlled.
 */
export function SingleImageUploadField({
  value,
  onChange,
  upload,
  label = "Imagen",
  description = "JPG, PNG o WebP",
  emptyLabel = "Todavía no seleccionaste una imagen",
  accept = "image/*",
  maxSize = DEFAULT_MAX_IMAGE_SIZE,
  previewShape = "square",
  disabled = false,
}: SingleImageUploadFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string>();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  async function selectFile(file: File) {
    const validationError = validateImage(file, maxSize);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(undefined);
    setProgress(0);
    setLocalPreview(URL.createObjectURL(file));
    setIsUploading(true);
    try {
      const [uploaded] = await upload([file], { onProgress: setProgress });
      if (!uploaded) {
        setError("La carga no devolvió ninguna imagen.");
        return;
      }
      onChange(uploaded);
      setLocalPreview(undefined);
    } catch {
      setError("No se pudo subir la imagen. Intenta de nuevo.");
    } finally {
      setIsUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const previewUrl = localPreview ?? value?.url;

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
          "relative grid place-items-center overflow-hidden border border-dashed bg-muted/50",
          previewShapeClasses[previewShape],
        )}
      >
        {previewUrl ? (
          // Storybook prototype supports object URLs and arbitrary remote URLs.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={`Vista previa de ${label.toLowerCase()}`}
            className="size-full object-cover"
          />
        ) : (
          <button
            type="button"
            className="grid size-full touch-manipulation justify-items-center gap-2 p-4 text-center text-xs text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-not-allowed"
            disabled={disabled || isUploading}
            aria-label={`Seleccionar ${label.toLowerCase()} desde la vista previa`}
            onClick={() => inputRef.current?.click()}
          >
            <ImageIcon className="size-8" aria-hidden="true" />
            <span>{emptyLabel}</span>
          </button>
        )}
        {isUploading ? (
          <div className="absolute inset-x-3 bottom-3 rounded-md bg-background/95 p-2 shadow">
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
          if (file) void selectFile(file);
        }}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="gap-2"
          disabled={disabled || isUploading}
          onClick={() => inputRef.current?.click()}
        >
          {isUploading ? (
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <UploadIcon className="size-4" aria-hidden="true" />
          )}
          {value || localPreview ? "Cambiar imagen" : "Seleccionar imagen"}
        </Button>
        {value && !isUploading ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="gap-2"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <XIcon className="size-4" aria-hidden="true" />
            Quitar
          </Button>
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
