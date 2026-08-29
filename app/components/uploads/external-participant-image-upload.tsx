"use client";

import { Building2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { UploadThingImageButton } from "@/app/components/uploads/uploadthing-image-button";

type ExternalParticipantImageUploadProps = {
  imageUrl?: string;
  onChange: (imageUrl: string) => void;
  onRemove?: () => Promise<void> | void;
};

/**
 * Shared image/logo control for external participants.
 *
 * This is deliberately independent from react-hook-form so reservation and
 * participant forms can use the same control and Storybook can exercise it
 * without a form or backend.
 */
export function ExternalParticipantImageUpload({
  imageUrl,
  onChange,
  onRemove,
}: ExternalParticipantImageUploadProps) {
  async function handleRemove() {
    try {
      await onRemove?.();
    } catch {
      toast.error("Error al eliminar la imagen");
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-dashed p-3">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {imageUrl ? (
          // This preview can be an object URL, UploadThing URL, or pasted URL.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Vista previa"
            className="size-full object-cover"
          />
        ) : (
          <Building2Icon className="size-7 text-muted-foreground" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
        <UploadThingImageButton
          endpoint="externalParticipantImage"
          hasImage={Boolean(imageUrl)}
          onUploadComplete={onChange}
          successMessage="Imagen subida"
          invalidResponseMessage="Respuesta de carga inválida"
          errorMessage="Error al subir la imagen"
        />
        {imageUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void handleRemove()}
          >
            Quitar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
