"use client";

import Image from "next/image";
import { useId } from "react";

import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { UploadThingImageButton } from "@/app/components/uploads/uploadthing-image-button";
import { isAllowedProgramArtworkUrl } from "@/app/lib/programs/artwork";
import { cn } from "@/lib/utils";

type BannerImageUploadProps = {
  title: string;
  recommendation: string;
  imageUrl: string;
  onChange: (imageUrl: string) => void;
  previewClassName: string;
  previewMaxWidth?: string;
  required?: boolean;
  successMessage?: string;
};

/** One responsive marketing-banner image slot with preview, upload, and URL input. */
export function BannerImageUpload({
  title,
  recommendation,
  imageUrl,
  onChange,
  previewClassName,
  previewMaxWidth = "max-w-lg",
  required = false,
  successMessage = "Imagen subida",
}: BannerImageUploadProps) {
  const inputId = useId();
  const canPreview = isAllowedProgramArtworkUrl(imageUrl);

  return (
    <div className="space-y-2 rounded-lg border p-4">
      <Label>
        {title} ({required ? "obligatoria" : "opcional"})
      </Label>
      <p className="text-xs text-muted-foreground">{recommendation}</p>
      <div
        className={cn(
          "relative mt-2 w-full overflow-hidden rounded-md border bg-muted",
          previewClassName,
          previewMaxWidth,
        )}
      >
        {canPreview ? (
          <Image
            src={imageUrl}
            alt={`Vista previa ${title.toLowerCase()}`}
            fill
            className="object-contain"
            sizes="512px"
          />
        ) : (
          <div className="flex size-full min-h-24 items-center justify-center p-2 text-center text-xs text-muted-foreground">
            Sin imagen
          </div>
        )}
      </div>
      <UploadThingImageButton
        endpoint="bannerImage"
        hasImage={Boolean(imageUrl)}
        onUploadComplete={onChange}
        successMessage={successMessage}
        tooLargeMessage="Imagen demasiado grande (máx. 4MB)"
        errorMessage="Error al subir"
      />
      <Label htmlFor={inputId} className="text-xs text-muted-foreground">
        {required ? "O pega la URL" : "URL (opcional)"}
      </Label>
      <Input
        id={inputId}
        placeholder={required ? undefined : "URL (opcional)"}
        value={imageUrl}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
