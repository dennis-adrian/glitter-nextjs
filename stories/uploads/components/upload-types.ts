/**
 * Shared upload contract for image components under
 * `stories/uploads/components`. Components depend only on these types and UI
 * primitives — never on a concrete upload transport.
 */
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
 * Transport-agnostic upload contract. Stories pass an `upload` adapter; app
 * code can wire its own transport without changing component UI.
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

const FORMAT_LABELS: Record<string, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/gif": "GIF",
  "image/avif": "AVIF",
  "image/svg+xml": "SVG",
};

function acceptTokens(accept: string) {
  return accept
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Whether `file` is one of the types an input's `accept` lists. The attribute
 * only filters the file picker — "All files", or a drop onto the input, gets
 * past it — so a field has to check again before it uploads anything.
 */
export function matchesAccept(file: File, accept: string): boolean {
  const tokens = acceptTokens(accept);
  if (tokens.length === 0) return true;
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith(".")) return name.endsWith(token);
    if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1));
    return type === token;
  });
}

/** "JPG o PNG" for "image/jpeg,image/png". */
function acceptLabel(accept: string) {
  const labels = [
    ...new Set(
      acceptTokens(accept).map(
        (token) =>
          FORMAT_LABELS[token] ??
          token.replace(/^\./, "").replace(/^.*\//, "").toUpperCase(),
      ),
    ),
  ];
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} o ${labels[labels.length - 1]}`;
}

export function validateImage(
  file: File,
  maxSize: number,
  accept = "image/*",
): string | undefined {
  if (!file.type.startsWith("image/")) {
    return "Seleccioná un archivo de imagen.";
  }
  if (!matchesAccept(file, accept)) {
    return `Usá una imagen en formato ${acceptLabel(accept)}.`;
  }
  if (file.size > maxSize) {
    return `La imagen supera el máximo de ${formatFileSize(maxSize)}.`;
  }
  return undefined;
}
