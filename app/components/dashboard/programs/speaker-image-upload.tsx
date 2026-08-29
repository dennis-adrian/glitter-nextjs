"use client";

import { XIcon } from "lucide-react";
import Image from "next/image";

import { UploadThingImageButton } from "@/app/components/uploads/uploadthing-image-button";
import { Button } from "@/app/components/ui/button";

type Props = {
  imageUrl?: string;
  speakerName?: string;
  onChange: (imageUrl: string) => void;
  onUploading: (isUploading: boolean) => void;
};

export default function SpeakerImageUpload({
  imageUrl,
  speakerName,
  onChange,
  onUploading,
}: Props) {
  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">Foto de perfil</p>
      <div className="flex items-center gap-4 rounded-lg border p-3">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-full bg-muted">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={
                speakerName ? `Foto de ${speakerName}` : "Foto del expositor"
              }
              fill
              sizes="80px"
              className="object-cover"
            />
          ) : (
            <div className="grid size-full place-items-center text-2xl font-semibold text-muted-foreground">
              {speakerName?.trim().slice(0, 1).toUpperCase() || "?"}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
          <UploadThingImageButton
            endpoint="speakerImage"
            hasImage={Boolean(imageUrl)}
            variant="primary"
            onUploading={onUploading}
            onUploadComplete={onChange}
          />

          {imageUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground"
              onClick={() => onChange("")}
            >
              <XIcon className="size-4" />
              Quitar foto
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
