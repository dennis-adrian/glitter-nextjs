"use client";

import {
  CheckCircle2Icon,
  ImageIcon,
  Loader2Icon,
  RefreshCwIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/app/components/ui/button";
import { Progress } from "@/app/components/ui/progress";
import { FittedImage } from "@/stories/uploads/components/fitted-image";
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
  instructions = "Selecciona una foto legible antes de confirmar.",
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
      setError("No se pudo subir el comprobante. Intenta de nuevo.");
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
        <div className="grid gap-3">
          <div className="relative mx-auto aspect-3/4 w-52 overflow-hidden rounded-lg border bg-muted">
            <FittedImage
              src={visibleUrl}
              alt={`Vista previa de ${title.toLowerCase()}`}
            />
            {uploadedImage && !selectedFile ? (
              <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-1 text-xs font-medium text-white">
                <CheckCircle2Icon className="size-3" aria-hidden="true" />
                Cargado
              </span>
            ) : null}
          </div>
          {selectedFile ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={isUploading}
                aria-label="Quitar imagen seleccionada"
                onClick={resetSelection}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          className="grid min-h-56 place-items-center rounded-xl border-2 border-dashed p-6 text-center transition-colors hover:bg-muted/40"
          onClick={() => inputRef.current?.click()}
        >
          <span className="grid justify-items-center gap-2">
            <span className="grid size-12 place-items-center rounded-full bg-muted">
              <ImageIcon className="size-6 text-muted-foreground" />
            </span>
            <span className="text-sm font-medium">Elegir una imagen</span>
            <span className="text-xs text-muted-foreground">
              Hasta {formatFileSize(maxSize)}
            </span>
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

      <div className="flex flex-wrap gap-2">
        {selectedFile ? (
          <Button
            type="button"
            className="flex-1 gap-2"
            disabled={isUploading}
            onClick={() => void confirmUpload()}
          >
            {isUploading ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <UploadIcon className="size-4" />
            )}
            {isUploading ? "Subiendo..." : confirmLabel}
          </Button>
        ) : uploadedImage ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => inputRef.current?.click()}
            >
              <RefreshCwIcon className="size-4" />
              Reemplazar
            </Button>
            {onClear ? (
              <Button type="button" variant="ghost" onClick={onClear}>
                Quitar
              </Button>
            ) : null}
          </>
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
