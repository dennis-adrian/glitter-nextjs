"use client";

import {
  CheckCircle2Icon,
  ImagesIcon,
  Loader2Icon,
  UploadCloudIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { FittedImage } from "@/stories/uploads/components/fitted-image";
import { ImagePreviewRemoveButton } from "@/stories/uploads/components/image-preview-remove-button";
import {
  DEFAULT_MAX_IMAGE_SIZE,
  formatFileSize,
  type ImageUploadAdapter,
  type UploadedImage,
  validateImage,
} from "@/stories/uploads/components/upload-types";

type SelectedImage = {
  file: File;
  previewUrl: string;
};

type MultiImageDropzoneProps = {
  upload: ImageUploadAdapter;
  onUploaded: (images: UploadedImage[]) => void;
  maxFiles?: number;
  maxSize?: number;
  title?: string;
  description?: string;
  disabled?: boolean;
};

/**
 * Batch-oriented image dropzone with local validation, removable previews,
 * aggregate progress, and an injected upload adapter.
 */
export function MultiImageDropzone({
  upload,
  onUploaded,
  maxFiles = 5,
  maxSize = DEFAULT_MAX_IMAGE_SIZE,
  title = "Imágenes",
  description = "Arrastrá imágenes aquí o seleccionálas desde tu dispositivo.",
  disabled = false,
}: MultiImageDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrls = useRef(new Set<string>());
  const [selected, setSelected] = useState<SelectedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [uploadedCount, setUploadedCount] = useState(0);

  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  function addFiles(files: File[]) {
    const availableSlots = Math.max(0, maxFiles - selected.length);
    if (availableSlots === 0) {
      setError(`Solo podés seleccionar ${maxFiles} imágenes.`);
      return;
    }

    const accepted: SelectedImage[] = [];
    const messages: string[] = [];
    if (files.length > availableSlots) {
      messages.push(
        `Solo se añadieron ${availableSlots} de ${files.length} imágenes.`,
      );
    }
    for (const file of files.slice(0, availableSlots)) {
      const validationError = validateImage(file, maxSize);
      if (validationError) {
        messages.push(`${file.name}: ${validationError}`);
        continue;
      }
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      accepted.push({ file, previewUrl });
    }

    if (messages.length > 0) {
      setError(messages.join(" "));
    } else {
      setError(undefined);
    }

    setSelected((current) => [...current, ...accepted]);
    setUploadedCount(0);
  }

  function removeFile(index: number) {
    setSelected((current) => {
      const target = current[index];
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        previewUrls.current.delete(target.previewUrl);
      }
      return current.filter((_, currentIndex) => currentIndex !== index);
    });
  }

  function clearSelection() {
    for (const image of selected) {
      URL.revokeObjectURL(image.previewUrl);
      previewUrls.current.delete(image.previewUrl);
    }
    setSelected([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function uploadSelected() {
    if (selected.length === 0) return;

    setIsUploading(true);
    setError(undefined);
    setProgress(0);
    try {
      const uploaded = await upload(
        selected.map((item) => item.file),
        { onProgress: setProgress },
      );
      onUploaded(uploaded);
      setUploadedCount(uploaded.length);
      clearSelection();
    } catch {
      setError("No se pudieron subir las imágenes. Intentá de nuevo.");
    } finally {
      setIsUploading(false);
      setProgress(0);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (!disabled && !isUploading)
      addFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <section
      className="grid w-full max-w-2xl gap-4"
      aria-labelledby={`${inputId}-title`}
    >
      <div>
        <h3 id={`${inputId}-title`} className="font-semibold">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        disabled={disabled || isUploading}
        aria-label={`Seleccionar ${title.toLowerCase()}`}
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />

      <div
        className={cn(
          "rounded-xl border-2 border-dashed transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/30",
          (disabled || isUploading) && "pointer-events-none opacity-60",
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <button
          type="button"
          className="flex min-h-48 w-full flex-col items-center justify-center gap-1.5 p-6 text-center"
          disabled={disabled || isUploading}
          onClick={() => inputRef.current?.click()}
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-muted">
            <UploadCloudIcon className="size-6 text-muted-foreground" />
          </span>
          <span className="font-medium leading-snug">Seleccionar imágenes</span>
          <span className="text-xs leading-snug text-muted-foreground">
            Máximo {maxFiles} · {formatFileSize(maxSize)} cada una
          </span>
        </button>
      </div>

      {selected.length > 0 ? (
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              Seleccionadas ({selected.length}/{maxFiles})
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isUploading}
              onClick={clearSelection}
            >
              Limpiar
            </Button>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {selected.map((image, index) => (
              <li key={`${image.file.name}-${index}`} className="grid gap-1.5">
                <div className="relative">
                  <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
                    <FittedImage
                      src={image.previewUrl}
                      alt={image.file.name}
                      className="absolute inset-0"
                    />
                  </div>
                  <ImagePreviewRemoveButton
                    label={`Quitar ${image.file.name}`}
                    disabled={isUploading}
                    onClick={() => removeFile(index)}
                  />
                </div>
                <p className="truncate px-0.5 text-xs text-muted-foreground">
                  {image.file.name}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {isUploading ? (
        <div className="grid gap-1" aria-live="polite">
          <div className="flex justify-between text-xs">
            <span>Subiendo lote</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>
      ) : null}

      <div className="grid w-full">
        <Button
          type="button"
          className="h-auto min-h-11 w-full justify-center gap-2 whitespace-normal touch-manipulation"
          disabled={disabled || isUploading || selected.length === 0}
          onClick={() => void uploadSelected()}
        >
          {isUploading ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <ImagesIcon className="size-4 shrink-0" />
          )}
          {isUploading
            ? "Subiendo..."
            : `Subir ${selected.length || ""} ${
                selected.length === 1 ? "imagen" : "imágenes"
              }`.trim()}
        </Button>
      </div>

      {uploadedCount > 0 ? (
        <p
          className="flex items-center gap-2 text-sm font-medium text-emerald-700"
          role="status"
        >
          <CheckCircle2Icon className="size-4" />
          {uploadedCount}{" "}
          {uploadedCount === 1 ? "imagen subida" : "imágenes subidas"}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
