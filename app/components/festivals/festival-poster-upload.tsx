"use client";

import { useCallback, useMemo, useRef } from "react";

import { useUploadThing } from "@/app/vendors/uploadthing";
import { SingleImageUploadField } from "@/stories/uploads/components/single-image-upload-field";
import type {
  ImageUploadAdapter,
  UploadedImage,
} from "@/stories/uploads/components/upload-types";

type FestivalPosterUploadProps = {
  value: string | null;
  onChange: (imageUrl: string | null) => void;
  onUploadingChange?: (isUploading: boolean) => void;
  disabled?: boolean;
};

export default function FestivalPosterUpload({
  value,
  onChange,
  onUploadingChange,
  disabled = false,
}: FestivalPosterUploadProps) {
  const progressRef = useRef<(progress: number) => void>(() => undefined);
  const { startUpload } = useUploadThing("festivalArtwork", {
    onUploadProgress: (progress) => progressRef.current(progress),
  });

  const currentImage = useMemo<UploadedImage | null>(
    () =>
      value
        ? {
            id: value,
            name: "Póster actual",
            size: 0,
            url: value,
          }
        : null,
    [value],
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

  return (
    <SingleImageUploadField
      value={currentImage}
      onChange={(image) => onChange(image?.url ?? null)}
      upload={upload}
      label="Póster"
      description="JPG, PNG o WebP · formato vertical 3:4 recomendado"
      emptyLabel="Todavía no añadiste un póster"
      confirmLabel="Subir póster"
      previewShape="portrait"
      fit="contain"
      disabled={disabled}
      onUploadingChange={onUploadingChange}
    />
  );
}
