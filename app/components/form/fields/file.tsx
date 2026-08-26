"use client";

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import {
  type ImageUploadEndpoint,
  UploadThingImageButton,
} from "@/app/components/uploads/uploadthing-image-button";
import { UseFormReturn } from "react-hook-form";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/app/components/ui/button";
import { deleteFile } from "@/app/lib/uploadthing/actions";

// TODO: Mejorar la interfaz del componente
// Permitir que se suban varios archivos, que se pueda elegir el endpoint y manejar previews
export default function FileInput({
  formControl,
  label,
  name,
  messagePosition = "bottom",
  description,
  endpoint = "imageUploader",
  onUploading,
}: {
  formControl: UseFormReturn<any>["control"];
  label?: string;
  messagePosition?: "top" | "bottom";
  name: string;
  description?: string;
  endpoint?: ImageUploadEndpoint;
  onUploading?: (isUploading: boolean) => void;
}) {
  return (
    <FormField
      control={formControl}
      name={name}
      render={({ field }) => (
        <FormItem className="w-full grid gap-2">
          {label && <FormLabel>{label}</FormLabel>}
          {messagePosition === "top" && <FormMessage />}
          <FormControl>
            <div className="flex flex-col gap-2">
              {field.value && (
                <div className="flex items-center gap-2 p-2 border rounded-md">
                  <p className="text-sm truncate flex-1">{field.value}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={async () => {
                      try {
                        const result = await deleteFile(field.value);
                        if (result.success) {
                          field.onChange("");
                          toast.success("Archivo eliminado correctamente");
                        } else {
                          toast.error(
                            result.error || "Error al eliminar el archivo",
                          );
                        }
                      } catch (error) {
                        console.error("Error deleting file", error);
                        toast.error("Error al eliminar el archivo");
                      }
                    }}
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <UploadThingImageButton
                endpoint={endpoint}
                hasImage={Boolean(field.value)}
                buttonLabel="Elige un archivo"
                changeLabel="Cambiar archivo"
                allowedContent="Archivo hasta 4MB"
                onUploading={onUploading}
                onUploadComplete={field.onChange}
                successMessage="Archivo subido correctamente"
                errorMessage="Error al subir el archivo"
              />
            </div>
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          {messagePosition === "bottom" && <FormMessage />}
        </FormItem>
      )}
    />
  );
}
