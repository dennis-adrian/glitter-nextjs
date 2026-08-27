import type { ImageObjectPosition } from "@/stories/uploads/components/image-object-position";

export type {
  ImageFit,
  ImageObjectPosition,
} from "@/stories/uploads/components/image-object-position";

export type UploadedImage = {
  id: string;
  name: string;
  size: number;
  url: string;
  objectPosition?: ImageObjectPosition;
};

export type UploadOptions = {
  onProgress: (progress: number) => void;
};

/**
 * Transport-agnostic upload contract.
 *
 * Storybook supplies a deterministic in-memory adapter. A future application
 * integration can adapt UploadThing without changing any component UI.
 */
export type ImageUploadAdapter = (
  files: File[],
  options: UploadOptions,
) => Promise<UploadedImage[]>;

export const DEFAULT_MAX_IMAGE_SIZE = 4 * 1024 * 1024;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateImage(file: File, maxSize: number): string | undefined {
  if (!file.type.startsWith("image/")) {
    return "Seleccioná un archivo de imagen.";
  }
  if (file.size > maxSize) {
    return `La imagen supera el máximo de ${formatFileSize(maxSize)}.`;
  }
  return undefined;
}
