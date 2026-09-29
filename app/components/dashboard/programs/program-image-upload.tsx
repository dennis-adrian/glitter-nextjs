"use client";

import { ImageIcon, XIcon } from "lucide-react";
import Image from "next/image";
import type { Control, FieldPath, FieldValues } from "react-hook-form";

import { UploadThingImageButton } from "@/app/components/uploads/uploadthing-image-button";
import { Button } from "@/app/components/ui/button";
import {
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { isAllowedProgramArtworkUrl } from "@/app/lib/programs/artwork";
import { cn } from "@/lib/utils";

/**
 * Generic over the form so the session form reuses it for its own image; the
 * field it binds to holds the uploaded URL as a string, blank for none.
 */
type Props<TValues extends FieldValues> = {
  control: Control<TValues>;
  description: string;
  label: string;
  name: FieldPath<TValues>;
  previewClassName: string;
  previewSizes: string;
  onUploading: (isUploading: boolean) => void;
  /**
   * Set when this viewer cannot upload (the endpoint is admin-only): the
   * button stays, disabled, with this as the reason.
   */
  uploadDisabledReason?: string;
};

export default function ProgramImageUpload<TValues extends FieldValues>({
  control,
  description,
  label,
  name,
  previewClassName,
  previewSizes,
  onUploading,
  uploadDisabledReason,
}: Props<TValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const imageUrl =
          typeof field.value === "string" ? field.value.trim() : "";
        const canPreview = isAllowedProgramArtworkUrl(imageUrl);

        return (
          <FormItem className="grid content-start gap-2 rounded-xl border bg-muted/20 p-4">
            <div>
              <FormLabel className="text-sm font-semibold text-foreground">
                {label}
              </FormLabel>
              <FormDescription className="mt-1 text-xs">
                {description}
              </FormDescription>
            </div>

            <div
              className={cn(
                "relative overflow-hidden rounded-lg border bg-muted",
                previewClassName,
              )}
            >
              {canPreview ? (
                <Image
                  src={imageUrl}
                  alt={`Vista previa: ${label.toLowerCase()}`}
                  fill
                  sizes={previewSizes}
                  className="object-cover"
                />
              ) : (
                <div className="grid size-full min-h-36 place-items-center px-6 text-center text-xs text-muted-foreground">
                  <div className="grid justify-items-center gap-2">
                    <ImageIcon className="size-8" aria-hidden="true" />
                    <span>
                      {imageUrl
                        ? "La imagen guardada no se puede mostrar. Sube una nueva."
                        : "Todavía no seleccionaste una imagen."}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-start gap-2">
              {uploadDisabledReason ? (
                <div className="grid gap-1">
                  <Button type="button" size="sm" disabled>
                    Seleccionar imagen
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {uploadDisabledReason}
                  </p>
                </div>
              ) : (
                <UploadThingImageButton
                  endpoint="programArtwork"
                  hasImage={Boolean(imageUrl)}
                  buttonLabel="Seleccionar imagen"
                  allowedContent="JPG, PNG o WebP · máximo 4 MB"
                  variant="primary"
                  onUploading={onUploading}
                  onUploadComplete={field.onChange}
                />
              )}

              {imageUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 px-2 text-muted-foreground"
                  onClick={() => field.onChange("")}
                >
                  <XIcon className="size-4" aria-hidden="true" />
                  Quitar
                </Button>
              ) : null}
            </div>

            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
