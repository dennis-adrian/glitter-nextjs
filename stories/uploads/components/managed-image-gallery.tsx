"use client";

import { ImagePlusIcon, Loader2Icon, StarIcon, Trash2Icon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/app/components/ui/button";
import { Progress } from "@/app/components/ui/progress";
import { cn } from "@/lib/utils";
import { FittedImage } from "@/stories/uploads/components/fitted-image";
import type { ImageFit } from "@/stories/uploads/components/image-object-position";
import {
  DEFAULT_MAX_IMAGE_SIZE,
  formatFileSize,
  type ImageUploadAdapter,
  type UploadedImage,
  validateImage,
} from "@/stories/uploads/components/upload-types";

export type ManagedGalleryImage = UploadedImage & {
  isPrimary: boolean;
};

type ManagedImageGalleryProps = {
  initialImages?: ManagedGalleryImage[];
  upload: ImageUploadAdapter;
  onChange?: (images: ManagedGalleryImage[]) => void;
  onDelete?: (image: ManagedGalleryImage) => Promise<void> | void;
  maxFiles?: number;
  maxSize?: number;
  title?: string;
  /**
   * How thumbnails sit in each tile. `contain` (default) shows the whole
   * image. `cover` fills the tile like a product card; drag to choose the crop.
   */
  fit?: ImageFit;
};

/**
 * Persisted multi-image gallery for products and other records. It uploads
 * files sequentially, keeps stable image IDs, and owns primary/delete actions.
 */
export function ManagedImageGallery({
  initialImages = [],
  upload,
  onChange,
  onDelete,
  maxFiles = 10,
  maxSize = DEFAULT_MAX_IMAGE_SIZE,
  title = "Galería de imágenes",
  fit = "contain",
}: ManagedImageGalleryProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState(initialImages);
  const onChangeRef = useRef(onChange);
  const lastNotifiedImagesRef = useRef(images);
  const [pendingNames, setPendingNames] = useState<string[]>([]);
  const [currentUpload, setCurrentUpload] = useState<{
    name: string;
    progress: number;
  }>();
  const [deletingIds, setDeletingIds] = useState(new Set<string>());
  const [error, setError] = useState<string>();

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (lastNotifiedImagesRef.current === images) return;
    lastNotifiedImagesRef.current = images;
    onChangeRef.current?.(images);
  }, [images]);

  function updateImages(
    updater: (current: ManagedGalleryImage[]) => ManagedGalleryImage[],
  ) {
    setImages(updater);
  }

  async function addFiles(files: File[]) {
    const availableSlots = Math.max(0, maxFiles - images.length);
    const candidates = files.slice(0, availableSlots);
    const validFiles: File[] = [];

    for (const file of candidates) {
      const validationError = validateImage(file, maxSize);
      if (validationError) {
        setError(`${file.name}: ${validationError}`);
      } else {
        validFiles.push(file);
      }
    }

    if (files.length > availableSlots) {
      setError(`La galería admite un máximo de ${maxFiles} imágenes.`);
    } else if (validFiles.length > 0) {
      setError(undefined);
    }

    setPendingNames(validFiles.map((file) => file.name));
    for (const file of validFiles) {
      setPendingNames((current) =>
        current.filter((name) => name !== file.name),
      );
      setCurrentUpload({ name: file.name, progress: 0 });
      try {
        const [uploaded] = await upload([file], {
          onProgress: (progress) =>
            setCurrentUpload({ name: file.name, progress }),
        });
        if (!uploaded) throw new Error("Missing upload result");
        updateImages((current) => [
          ...current,
          { ...uploaded, isPrimary: current.length === 0 },
        ]);
      } catch {
        setError(`No se pudo subir ${file.name}.`);
      }
    }
    setCurrentUpload(undefined);
    setPendingNames([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function setPrimary(id: string) {
    updateImages((current) =>
      current.map((image) => ({ ...image, isPrimary: image.id === id })),
    );
  }

  function setImagePosition(
    id: string,
    objectPosition: ManagedGalleryImage["objectPosition"],
  ) {
    updateImages((current) =>
      current.map((image) =>
        image.id === id ? { ...image, objectPosition } : image,
      ),
    );
  }

  async function deleteImage(image: ManagedGalleryImage) {
    setDeletingIds((current) => new Set(current).add(image.id));
    try {
      await onDelete?.(image);
      updateImages((current) => {
        const remaining = current.filter((item) => item.id !== image.id);
        if (image.isPrimary && remaining[0]) {
          remaining[0] = { ...remaining[0], isPrimary: true };
        }
        return remaining;
      });
    } catch {
      setError(`No se pudo eliminar ${image.name}.`);
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(image.id);
        return next;
      });
    }
  }

  const isUploading = Boolean(currentUpload) || pendingNames.length > 0;

  return (
    <section
      className="grid w-full max-w-3xl gap-4"
      aria-labelledby={`${inputId}-title`}
    >
      <div className="grid gap-3">
        <div>
          <h3 id={`${inputId}-title`} className="font-semibold">
            {title}
          </h3>
          <p className="text-sm text-muted-foreground">
            Elegí una imagen principal · máximo {maxFiles} archivos de{" "}
            {formatFileSize(maxSize)}
            {fit === "cover"
              ? " · arrastrá o pellizcá una imagen para ajustar el recorte"
              : ""}
          </p>
        </div>
        <div className="grid w-full">
          <Button
            type="button"
            className="h-auto min-h-11 w-full justify-center gap-2 whitespace-normal touch-manipulation"
            disabled={isUploading || images.length >= maxFiles}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlusIcon className="size-4 shrink-0" />
            Añadir imágenes
          </Button>
        </div>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        disabled={isUploading || images.length >= maxFiles}
        aria-label="Añadir imágenes a la galería"
        onChange={(event) =>
          void addFiles(Array.from(event.target.files ?? []))
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {images.map((image) => {
          const isDeleting = deletingIds.has(image.id);
          return (
            <article
              key={image.id}
              className={cn(
                "group relative aspect-square overflow-hidden rounded-xl border-2 bg-muted",
                image.isPrimary ? "border-primary" : "border-transparent",
                isDeleting && "opacity-50",
              )}
            >
              <FittedImage
                src={image.url}
                alt={image.name}
                fit={fit}
                position={image.objectPosition}
                onPositionChange={
                  fit === "cover"
                    ? (objectPosition) =>
                        setImagePosition(image.id, objectPosition)
                    : undefined
                }
                disabled={isDeleting}
                className="absolute inset-0"
              />
              {image.isPrimary ? (
                <span className="absolute bottom-2 left-2 z-10 rounded-full bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
                  Principal
                </span>
              ) : null}
              <div className="absolute right-1.5 top-1.5 z-10 flex gap-1">
                {!image.isPrimary ? (
                  <button
                    type="button"
                    className="grid size-11 place-items-center rounded-full bg-background/95 shadow-md touch-manipulation"
                    aria-label={`Establecer ${image.name} como principal`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => setPrimary(image.id)}
                  >
                    <StarIcon className="size-4 text-amber-500" />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="grid size-11 place-items-center rounded-full bg-background/95 shadow-md touch-manipulation"
                  aria-label={`Eliminar ${image.name}`}
                  disabled={isDeleting}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => void deleteImage(image)}
                >
                  {isDeleting ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <Trash2Icon className="size-4 text-destructive" />
                  )}
                </button>
              </div>
            </article>
          );
        })}

        {currentUpload ? (
          <div className="grid aspect-square place-items-center rounded-xl border bg-muted p-3">
            <div className="w-full text-center">
              <Loader2Icon className="mx-auto mb-2 size-6 animate-spin text-primary" />
              <p className="truncate text-xs font-medium">
                {currentUpload.name}
              </p>
              <Progress value={currentUpload.progress} className="mt-2 h-1.5" />
              <p className="mt-1 text-xs text-muted-foreground">
                {currentUpload.progress}%
              </p>
            </div>
          </div>
        ) : null}

        {pendingNames.map((name) => (
          <div
            key={name}
            className="grid aspect-square place-items-center rounded-xl border border-dashed bg-muted/40 p-3 text-center"
          >
            <div>
              <p className="truncate text-xs font-medium">{name}</p>
              <p className="text-xs text-muted-foreground">En cola</p>
            </div>
          </div>
        ))}

        {images.length === 0 && !isUploading ? (
          <button
            type="button"
            className="col-span-2 flex min-h-48 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-6 text-center text-sm text-muted-foreground sm:col-span-3 md:col-span-4"
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlusIcon className="size-8 shrink-0" />
            <span className="leading-snug">Añadí la primera imagen</span>
          </button>
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
