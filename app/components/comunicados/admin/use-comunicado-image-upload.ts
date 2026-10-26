"use client";

import { useCallback } from "react";
import { toast } from "sonner";

import {
  COMUNICADO_IMAGE_MAX_BYTES,
  COMUNICADO_IMAGE_TYPES,
} from "@/app/lib/comunicados/definitions";
import { useUploadThing } from "@/app/vendors/uploadthing";

export const COMUNICADO_IMAGE_TYPE_MESSAGE = "Subí una imagen JPG o PNG.";
export const COMUNICADO_IMAGE_SIZE_MESSAGE = "La imagen pesa más de 4 MB.";
export const COMUNICADO_IMAGE_UPLOAD_FAILED = "No se pudo subir la imagen.";

/**
 * Why a file cannot be a comunicado image, before anything is sent: the
 * route takes JPEG and PNG up to 4 MB (C4), and BlockNote hands over any
 * `image/*` that is picked, pasted or dropped.
 */
export function comunicadoImageFileProblem(file: File): string | null {
  if (!(COMUNICADO_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return COMUNICADO_IMAGE_TYPE_MESSAGE;
  }
  if (file.size > COMUNICADO_IMAGE_MAX_BYTES) {
    return COMUNICADO_IMAGE_SIZE_MESSAGE;
  }
  return null;
}

/**
 * The announcement editor's `uploadFile` (C4): the file goes to the
 * `comunicadoImage` route and comes back as its `https://….ufs.sh/f/<key>`
 * address. A refusal throws its sentence, for the upload tab to show, and
 * toasts it too, since a paste or a drop has no panel to show it in.
 */
export function useComunicadoImageUpload(): (file: File) => Promise<string> {
  const { startUpload } = useUploadThing("comunicadoImage");

  return useCallback(
    async (file: File) => {
      const fail = (message: string): never => {
        toast.error(message);
        throw new Error(message);
      };

      const problem = comunicadoImageFileProblem(file);
      if (problem) return fail(problem);

      let url: string | undefined;
      try {
        // A refused or failed upload answers undefined.
        const result = await startUpload([file]);
        url = result?.[0]?.serverData?.imageUrl;
      } catch {
        url = undefined;
      }
      return url || fail(COMUNICADO_IMAGE_UPLOAD_FAILED);
    },
    [startUpload],
  );
}
