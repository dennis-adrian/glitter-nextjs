"use client";

import { cn } from "@/app/lib/utils";
import { UploadThingImageButton } from "@/app/components/uploads/uploadthing-image-button";
import Image from "next/image";
import { slugify } from "@/app/lib/formatters";

export default function SectorImageUpload({
  imageUrl,
  setImageUrl,
  sectorName,
  onUploading,
}: {
  imageUrl: string | null;
  setImageUrl: (imageUrl: string) => void;
  sectorName: string;
  onUploading?: (isUploading: boolean) => void;
}) {
  const fileName = `${slugify(sectorName)}_image`;

  return (
    <div className="flex flex-col items-center justify-center">
      <div className={cn("relative mb-4 border border-dashed w-full h-48")}>
        <Image
          className="object-cover"
          alt={`Imagen del sector ${sectorName}`}
          src={imageUrl || "/img/placeholders/placeholder-500x500.png"}
          sizes="(max-width: 640px) 100vw, 240px"
          fill
        />
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
