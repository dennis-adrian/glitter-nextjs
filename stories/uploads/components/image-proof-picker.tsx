"use client";

import {
  CheckCircle2Icon,
  ImageIcon,
  Loader2Icon,
  UploadIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FittedImage } from "@/stories/uploads/components/fitted-image";
import { ImagePreviewRemoveButton } from "@/stories/uploads/components/image-preview-remove-button";
import {
  DEFAULT_MAX_IMAGE_SIZE,
  formatFileSize,
  type ImageUploadAdapter,
  type UploadedImage,
  validateImage,
} from "@/stories/uploads/components/upload-types";

type ImageProofPickerProps = {
  uploadedImage?: UploadedImage | null;
  onUploaded: (image: UploadedImage) => void;
  onClear?: () => void;
  upload: ImageUploadAdapter;
  title?: string;
  instructions?: string;
  confirmLabel?: string;
  accept?: string;
  maxSize?: number;
};

/**
 * Staged image picker for evidence and payment proofs. Selection and preview
 * happen locally; bytes are uploaded only after explicit confirmation.
 */
export function ImageProofPicker({
  uploadedImage,
  onUploaded,
  onClear,
  upload,
  title = "Comprobante",
  instructions = "Seleccioná una foto legible antes de confirmar.",
  confirmLabel = "Subir comprobante",
  accept = "image/*",
  maxSize = DEFAULT_MAX_IMAGE_SIZE,
}: ImageProofPickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File>();
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function chooseFile(file: File) {
    const validationError = validateImage(file, maxSize);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(undefined);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function resetSelection() {
    setSelectedFile(undefined);
    setPreviewUrl(undefined);
    setProgress(0);
    setError(undefined);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function confirmUpload() {
    if (!selectedFile) return;

    setIsUploading(true);
    setError(undefined);
    try {
      const [uploaded] = await upload([selectedFile], {
        onProgress: setProgress,
      });
      if (!uploaded) {
        setError("La carga no devolvió ningún comprobante.");
        return;
      }
      onUploaded(uploaded);
      resetSelection();
    } catch {
      setError("No se pudo subir el comprobante. Intentá de nuevo.");
    } finally {
      setIsUploading(false);
    }
  }

  const visibleUrl = previewUrl ?? uploadedImage?.url;

  return (
    <section
      className="grid w-full max-w-md gap-4 rounded-xl border bg-card p-4 text-card-foreground shadow-sm"
      aria-labelledby={`${inputId}-title`}
    >
      <div>
        <h3 id={`${inputId}-title`} className="font-semibold">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{instructions}</p>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={isUploading}
        aria-label={`Seleccionar ${title.toLowerCase()}`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) chooseFile(file);
        }}
      />

      {visibleUrl ? (
        <div className="grid w-full gap-2">
          <div className="relative w-full">
            <div className="relative aspect-3/4 w-full overflow-hidden rounded-lg border bg-muted">
              <FittedImage
                src={visibleUrl}
                alt={`Vista previa de ${title.toLowerCase()}`}
                className="absolute inset-0"
              />
              {uploadedImage && !selectedFile ? (
                <span className="absolute bottom-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-1 text-xs font-medium text-white">
                  <CheckCircle2Icon className="size-3" aria-hidden="true" />
                  Cargado
                </span>
              ) : null}
            </div>
            {!isUploading ? (
              <ImagePreviewRemoveButton
                label={`Quitar ${title.toLowerCase()}`}
                onClick={() => {
                  if (selectedFile) {
                    resetSelection();
                    return;
                  }
                  onClear?.();
                }}
              />
            ) : null}
          </div>
          {selectedFile ? (
            <p className="truncate text-center text-sm">
              {selectedFile.name}
              <span className="block text-xs text-muted-foreground">
                {formatFileSize(selectedFile.size)}
              </span>
            </p>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          className="flex min-h-56 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-6 text-center transition-colors hover:bg-muted/40"
          onClick={() => inputRef.current?.click()}
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-muted">
            <ImageIcon className="size-6 text-muted-foreground" />
          </span>
          <span className="text-sm font-medium leading-snug">
            Elegí una imagen
          </span>
          <span className="text-xs leading-snug text-muted-foreground">
            Hasta {formatFileSize(maxSize)}
          </span>
        </button>
      )}

      {isUploading ? (
        <div className="grid gap-1" aria-live="polite">
          <div className="flex justify-between text-xs">
            <span>Subiendo comprobante</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>
      ) : null}

      {selectedFile ? (
        <div className="grid w-full">
          <Button
            type="button"
            className="h-auto min-h-11 w-full justify-center gap-2 whitespace-normal touch-manipulation"
            disabled={isUploading}
            onClick={() => void confirmUpload()}
          >
            {isUploading ? (
              <Loader2Icon className="size-4 shrink-0 animate-spin" />
            ) : (
              <UploadIcon className="size-4 shrink-0" />
            )}
            {isUploading ? "Subiendo..." : confirmLabel}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
