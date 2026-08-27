"use client";

import { ImageIcon, Loader2Icon, Trash2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";

import type { OurFileRouter } from "@/app/api/uploadthing/core";
import EntityThumbnail from "@/app/components/molecules/entity-thumbnail";
import { Button } from "@/app/components/ui/button";
import { deleteFile } from "@/app/lib/uploadthing/actions";
import { UploadButton } from "@/app/vendors/uploadthing";

type ImageUploadFieldProps = {
  value?: string | null;
  onChange: (url: string | null) => void;
  endpoint?: keyof OurFileRouter;
  alt?: string;
};

const buttonAppearance =
  "!h-10 !w-auto !rounded-md !border !border-input !bg-background !px-4 !text-sm !font-medium !text-foreground hover:!bg-accent hover:!text-accent-foreground after:!bg-primary/40";

export default function ImageUploadField({
  value,
  onChange,
  endpoint = "categoryImage",
  alt = "Imagen",
}: ImageUploadFieldProps) {
  const uploadButton = (
    <UploadButton
      content={{
        button({ ready, isUploading, uploadProgress }) {
          if (isUploading) {
            return (
              <span className="flex items-center gap-2">
                <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
                {uploadProgress}%
              </span>
            );
          }
          if (ready) {
            return (
              <span className="flex items-center gap-2">
                <UploadIcon className="size-4" aria-hidden="true" />
                {value ? "Reemplazar imagen" : "Añadir imagen"}
              </span>
            );
          }
          return "Cargando...";
        },
        allowedContent: () => null,
      }}
      appearance={{
        button: buttonAppearance,
        container: "w-fit",
        allowedContent: "hidden",
      }}
      endpoint={endpoint}
      onClientUploadComplete={async (res) => {
        const uploaded = res?.[0];
        const nextUrl =
          (uploaded?.serverData as { imageUrl?: string } | undefined)
            ?.imageUrl || uploaded?.url;
        if (!nextUrl) {
          toast.error("Error al subir la imagen");
          return;
        }
        if (value && value !== nextUrl) {
          await deleteFile(value);
        }
        onChange(nextUrl);
        toast.success("Imagen subida");
      }}
      onUploadError={() => {
        toast.error("Error al subir la imagen");
      }}
    />
  );

  if (!value) {
    return (
      <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-4 py-8">
        <ImageIcon
          className="size-8 text-muted-foreground"
          aria-hidden="true"
        />
        {uploadButton}
        <p className="text-xs text-muted-foreground">
          JPG, PNG o WebP · máximo 4 MB
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <EntityThumbnail src={value} alt={alt} size="md" />
      <div className="flex flex-wrap items-center gap-2">
        {uploadButton}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 text-muted-foreground"
          onClick={async () => {
            const result = await deleteFile(value);
            if (!result.success) {
              toast.error(result.error || "Error al eliminar la imagen");
              return;
            }
            onChange(null);
            toast.success("Imagen eliminada");
          }}
        >
          <Trash2Icon className="mr-1 size-4" />
          Quitar
        </Button>
      </div>
    </div>
  );
}
