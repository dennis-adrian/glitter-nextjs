"use client";

import { Loader2Icon, UploadIcon } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";

import { UploadButton } from "@/app/vendors/uploadthing";

export type ImageUploadEndpoint =
  | "bannerImage"
  | "externalParticipantImage"
  | "imageUploader"
  | "profilePicture"
  | "programArtwork"
  | "qrCode"
  | "speakerImage";

type UploadedFile = {
  serverData?: unknown;
  url?: unknown;
};

type UploadThingImageButtonProps = {
  endpoint: ImageUploadEndpoint;
  onUploadComplete: (imageUrl: string) => void;
  onUploading?: (isUploading: boolean) => void;
  transformFiles?: (files: File[]) => File[];
  buttonLabel?: string;
  changeLabel?: string;
  allowedContent?: string;
  successMessage?: string;
  invalidResponseMessage?: string;
  errorMessage?: string;
  tooLargeMessage?: string;
  hasImage?: boolean;
  variant?: "outline" | "primary";
};

function readImageUrl(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;

  const file = value as UploadedFile;
  if (typeof file.url === "string") return file.url;
  if (!file.serverData || typeof file.serverData !== "object") return null;

  const serverData = file.serverData as Record<string, unknown>;
  if (typeof serverData.imageUrl === "string") return serverData.imageUrl;
  if (!serverData.results || typeof serverData.results !== "object")
    return null;

  const results = serverData.results as Record<string, unknown>;
  return typeof results.imageUrl === "string" ? results.imageUrl : null;
}

function buttonContent({
  ready,
  isUploading,
  uploadProgress,
  label,
}: {
  ready: boolean;
  isUploading: boolean;
  uploadProgress: number;
  label: string;
}): ReactNode {
  if (isUploading) {
    return (
      <span className="flex items-center gap-2">
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        {uploadProgress}%
      </span>
    );
  }
  if (ready) {
    return (
      <span className="flex items-center gap-2">
        <UploadIcon className="size-4" aria-hidden="true" />
        {label}
      </span>
    );
  }
  return "Cargando...";
}

/**
 * Shared UploadThing image button used by forms that only need one image URL.
 * Domain-specific previews stay in their parent component while upload states,
 * URL extraction, size errors, and visual styling remain consistent.
 */
export function UploadThingImageButton({
  endpoint,
  onUploadComplete,
  onUploading,
  transformFiles,
  buttonLabel = "Subir imagen",
  changeLabel = "Cambiar imagen",
  allowedContent = "Imagen de hasta 4 MB",
  successMessage = "Imagen subida correctamente",
  invalidResponseMessage = "No se pudo obtener la imagen subida",
  errorMessage = "No se pudo subir la imagen",
  tooLargeMessage = "La imagen supera el máximo de 4 MB",
  hasImage = false,
  variant = "outline",
}: UploadThingImageButtonProps) {
  return (
    <UploadButton
      config={{ cn: twMerge }}
      endpoint={endpoint}
      content={{
        button({ ready, isUploading, uploadProgress }) {
          return buttonContent({
            ready,
            isUploading,
            uploadProgress,
            label: hasImage ? changeLabel : buttonLabel,
          });
        },
        allowedContent({ ready, isUploading }) {
          if (!ready || isUploading) return null;
          return allowedContent;
        },
      }}
      appearance={{
        button:
          variant === "primary"
            ? "h-9 w-auto bg-primary px-3 text-xs text-primary-foreground after:bg-primary/60"
            : ({ ready, isUploading }) => {
                if (!ready) {
                  return "h-9 w-auto border bg-transparent px-3 text-xs text-muted-foreground";
                }
                if (isUploading) {
                  return "h-9 w-auto border bg-transparent px-3 text-xs text-muted-foreground after:bg-primary-700/60";
                }
                return "h-9 w-auto border bg-transparent px-3 text-xs text-foreground hover:border-primary-500 hover:text-primary-500";
              },
        allowedContent: "text-xs text-muted-foreground",
      }}
      onBeforeUploadBegin={(files) => {
        onUploading?.(true);
        return transformFiles ? transformFiles(files) : files;
      }}
      onClientUploadComplete={(results) => {
        onUploading?.(false);
        const imageUrl = readImageUrl(results[0]);
        if (!imageUrl) {
          toast.error(invalidResponseMessage);
          return;
        }
        onUploadComplete(imageUrl);
        if (successMessage) toast.success(successMessage);
      }}
      onUploadError={(error) => {
        onUploading?.(false);
        const isTooLarge =
          error.code === "TOO_LARGE" ||
          error.message.includes("FileSizeMismatch") ||
          error.message.includes("FileSize");
        toast.error(isTooLarge ? tooLargeMessage : errorMessage);
      }}
    />
  );
}
