"use client";

import { Loader2Icon, UploadIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { UploadButton } from "@/app/vendors/uploadthing";

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
          <UploadButton
            endpoint="speakerImage"
            content={{
              button({ ready, isUploading, uploadProgress }) {
                if (isUploading) {
                  return (
                    <span className="flex items-center gap-2">
                      <Loader2Icon className="size-4 animate-spin" />
                      {uploadProgress}%
                    </span>
                  );
                }
                if (ready) {
                  return (
                    <span className="flex items-center gap-2">
                      <UploadIcon className="size-4" />
                      Subir imagen
                    </span>
                  );
                }
                return "Cargando...";
              },
              allowedContent({ ready, isUploading }) {
                if (!ready || isUploading) return null;
                return "Imagen de hasta 4 MB";
              },
            }}
            appearance={{
              button:
                "h-9 w-auto bg-primary px-3 text-xs text-primary-foreground after:bg-primary/60",
              allowedContent: "text-xs text-muted-foreground",
            }}
            onBeforeUploadBegin={(files) => {
              onUploading(true);
              return files;
            }}
            onClientUploadComplete={(results) => {
              onUploading(false);
              const uploadedUrl =
                results[0]?.serverData?.imageUrl ?? results[0]?.url;
              if (!uploadedUrl) {
                toast.error("No se pudo obtener la imagen subida");
                return;
              }
              onChange(uploadedUrl);
              toast.success("Imagen subida correctamente");
            }}
            onUploadError={(error) => {
              onUploading(false);
              toast.error(
                error.code === "TOO_LARGE"
                  ? "La imagen supera el máximo de 4 MB"
                  : "No se pudo subir la imagen",
              );
            }}
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
