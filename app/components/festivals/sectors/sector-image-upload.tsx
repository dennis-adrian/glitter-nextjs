"use client";

import { cn } from "@/app/lib/utils";
import { UploadThingImageButton } from "@/app/components/uploads/uploadthing-image-button";
import Image from "next/image";
import { slugify } from "@/app/lib/formatters";
import { ImageIcon } from "lucide-react";
import { useEffect, useRef } from "react";

export default function SectorImageUpload({
  imageUrl,
  setImageUrl,
  sectorName,
  onUploading,
  compact = false,
}: {
  imageUrl: string | null;
  setImageUrl: (imageUrl: string) => void;
  sectorName: string;
  onUploading?: (isUploading: boolean) => void;
  compact?: boolean;
}) {
  const onUploadingRef = useRef(onUploading);

  useEffect(() => {
    onUploadingRef.current = onUploading;
  }, [onUploading]);

  useEffect(() => {
    return () => onUploadingRef.current?.(false);
  }, []);

  const fileName = `${slugify(sectorName)}_image`;

  return (
    <div
      className={cn(
        "flex items-center",
        compact
          ? "flex-wrap gap-3 rounded-lg border border-dashed p-3"
          : "flex-col justify-center",
      )}
    >
      <div
        className={cn(
          "relative",
          compact
            ? "h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted"
            : "mb-4 border border-dashed w-full h-48",
        )}
      >
        {compact && !imageUrl ? (
          <ImageIcon
            className="absolute inset-0 m-auto size-6 text-muted-foreground"
            aria-hidden="true"
          />
        ) : (
          <Image
            className="object-cover"
            alt={
              compact
                ? "Vista previa de la imagen"
                : `Imagen del sector ${sectorName}`
            }
            src={imageUrl || "/img/placeholders/placeholder-500x500.png"}
            sizes="(max-width: 640px) 100vw, 240px"
            fill
          />
        )}
      </div>
      <UploadThingImageButton
        endpoint="imageUploader"
        hasImage={Boolean(imageUrl)}
        buttonLabel="Elige una imagen"
        onUploading={onUploading}
        transformFiles={(files) =>
          files.map((f) => {
            const fileExtension = f.name.split(".").pop();
            return new File([f], `${fileName}.${fileExtension}`, {
              type: f.type,
            });
          })
        }
        onUploadComplete={setImageUrl}
        tooLargeMessage="La imagen es demasiado grande. Máximo 4MB."
        errorMessage="Error al subir la imagen"
      />
    </div>
  );
}
