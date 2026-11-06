"use client";

import { useFestivalArtworkUpload } from "@/app/components/festivals/use-festival-artwork-upload";
import { FESTIVAL_ARTWORK_ACCEPT } from "@/app/lib/festivals/artwork";
import { SingleImageUploadField } from "@/stories/uploads/components/single-image-upload-field";

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
  const { currentImage, upload } = useFestivalArtworkUpload(
    value,
    "Póster actual",
  );

  return (
    <SingleImageUploadField
      value={currentImage}
      onChange={(image) => onChange(image?.url ?? null)}
      upload={upload}
      label="Póster"
      description="JPG, PNG o WebP · formato vertical 3:4 recomendado"
      // No SVG: the poster goes out in email too (see FESTIVAL_ARTWORK_TYPES).
      accept={FESTIVAL_ARTWORK_ACCEPT}
      emptyLabel="Todavía no añadiste un póster"
      confirmLabel="Subir póster"
      previewShape="portrait"
      fit="contain"
      disabled={disabled}
      onUploadingChange={onUploadingChange}
    />
  );
}
