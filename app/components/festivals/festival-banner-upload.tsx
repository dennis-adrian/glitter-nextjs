"use client";

import { useFestivalArtworkUpload } from "@/app/components/festivals/use-festival-artwork-upload";
import { FESTIVAL_ARTWORK_ACCEPT } from "@/app/lib/festivals/artwork";
import { SingleImageUploadField } from "@/stories/uploads/components/single-image-upload-field";

export type FestivalBannerVariant = "wide" | "mobile";

const COPY: Record<
  FestivalBannerVariant,
  {
    label: string;
    description: string;
    currentName: string;
    emptyLabel: string;
    confirmLabel: string;
  }
> = {
  wide: {
    label: "Banner ancho (3:1)",
    description: "JPG o PNG · 3:1 · recomendado 2400 × 800 px",
    currentName: "Banner ancho actual",
    emptyLabel: "Todavía no añadiste un banner ancho",
    confirmLabel: "Subir banner ancho",
  },
  mobile: {
    label: "Banner para teléfonos (3:2)",
    description: "JPG o PNG · 3:2 · recomendado 1200 × 800 px",
    currentName: "Banner para teléfonos actual",
    emptyLabel: "Todavía no añadiste un banner para teléfonos",
    confirmLabel: "Subir banner para teléfonos",
  },
};

type FestivalBannerUploadProps = {
  variant: FestivalBannerVariant;
  value: string | null;
  onChange: (imageUrl: string | null) => void;
  onUploadingChange?: (isUploading: boolean) => void;
  disabled?: boolean;
};

export default function FestivalBannerUpload({
  variant,
  value,
  onChange,
  onUploadingChange,
  disabled = false,
}: FestivalBannerUploadProps) {
  const copy = COPY[variant];
  const { currentImage, upload } = useFestivalArtworkUpload(
    value,
    copy.currentName,
  );

  return (
    <SingleImageUploadField
      value={currentImage}
      onChange={(image) => onChange(image?.url ?? null)}
      upload={upload}
      label={copy.label}
      description={copy.description}
      accept={FESTIVAL_ARTWORK_ACCEPT}
      emptyLabel={copy.emptyLabel}
      confirmLabel={copy.confirmLabel}
      previewShape="landscape"
      // Shown whole: the banner carries its own text, so never crop it.
      fit="contain"
      disabled={disabled}
      onUploadingChange={onUploadingChange}
    />
  );
}
