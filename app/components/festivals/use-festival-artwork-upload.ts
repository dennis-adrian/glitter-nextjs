"use client";

import { useCallback, useMemo, useRef } from "react";

import { useUploadThing } from "@/app/vendors/uploadthing";
import type {
  ImageUploadAdapter,
  UploadedImage,
} from "@/stories/uploads/components/upload-types";

/**
 * Upload adapter and current-image value for a festival artwork field
 * (poster or banners), through the `festivalArtwork` UploadThing route.
 */
export function useFestivalArtworkUpload(
  value: string | null,
  currentName: string,
) {
  const progressRef = useRef<(progress: number) => void>(() => undefined);
  const { startUpload } = useUploadThing("festivalArtwork", {
    onUploadProgress: (progress) => progressRef.current(progress),
  });

  const currentImage = useMemo<UploadedImage | null>(
    () => (value ? { id: value, name: currentName, size: 0, url: value } : null),
    [value, currentName],
  );

  const upload = useCallback<ImageUploadAdapter>(
    async (files, options) => {
      progressRef.current = options.onProgress;
      const uploaded = await startUpload(files);
      if (!uploaded) throw new Error("La carga no devolvió ninguna imagen.");

      return uploaded.map((file) => ({
        id: file.key,
        name: file.name,
        size: file.size,
        url: file.ufsUrl,
      }));
    },
    [startUpload],
  );

  return { currentImage, upload };
}
