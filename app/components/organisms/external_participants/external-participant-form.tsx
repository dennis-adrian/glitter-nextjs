"use client";

import PhoneInput from "@/app/components/form/fields/phone";
import SelectInput from "@/app/components/form/fields/select";
import TextInput from "@/app/components/form/fields/text";
import TextareaInput from "@/app/components/form/fields/textarea";
import SubmitButton from "@/app/components/simple-submit-button";
import { Button } from "@/app/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { UploadButton } from "@/app/vendors/uploadthing";
import {
  createExternalParticipant,
  updateExternalParticipant,
} from "@/app/lib/external_participants/actions";
import {
  ExternalParticipant,
  externalParticipantTypeOptions,
} from "@/app/lib/external_participants/definitions";
import { externalParticipantInputSchema } from "@/app/lib/external_participants/schema";
import { deleteFile } from "@/app/lib/uploadthing/actions";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2Icon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

type ExternalParticipantFormProps = {
  externalParticipant?: ExternalParticipant;
};

export default function ExternalParticipantForm({
  externalParticipant,
}: ExternalParticipantFormProps) {
  const router = useRouter();
  const isEditing = !!externalParticipant;

  const form = useForm<
    z.input<typeof externalParticipantInputSchema>,
    unknown,
    z.output<typeof externalParticipantInputSchema>
  >({
    resolver: zodResolver(externalParticipantInputSchema),
    defaultValues: {
      displayName: externalParticipant?.displayName ?? "",
      type: externalParticipant?.type ?? "institution",
      customCategoryLabel: externalParticipant?.customCategoryLabel ?? "",
      description: externalParticipant?.description ?? "",
      imageUrl: externalParticipant?.imageUrl ?? "",
      websiteUrl: externalParticipant?.websiteUrl ?? "",
      instagramUrl: externalParticipant?.instagramUrl ?? "",
      contactEmail: externalParticipant?.contactEmail ?? "",
      contactPhone: externalParticipant?.contactPhone ?? "",
    },
  });

  const imageUrl = form.watch("imageUrl");

  const action = form.handleSubmit(async (data) => {
    const result = isEditing
      ? await updateExternalParticipant(externalParticipant.id, data)
      : await createExternalParticipant(data);

    if (result.success) {
      toast.success(result.message);
      router.push("/dashboard/external_participants");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={action} className="grid max-w-2xl gap-4">
        <TextInput
          name="displayName"
          label="Nombre"
          placeholder="Nombre de la institución o marca"
          required
        />

        <SelectInput
          formControl={form.control}
          name="type"
          label="Tipo"
          placeholder="Seleccionar tipo"
          options={externalParticipantTypeOptions}
          required
        />

        <TextInput
          name="customCategoryLabel"
          label="Etiqueta de categoría"
          placeholder="Ej. Refugio animal"
        />

        <ExternalParticipantImageField imageUrl={imageUrl} />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextInput
            name="websiteUrl"
            label="Sitio web"
            placeholder="https://..."
            type="url"
          />
          <TextInput
            name="instagramUrl"
            label="Instagram"
            placeholder="https://instagram.com/..."
            type="url"
          />
          <TextInput
            name="contactEmail"
            label="Correo de contacto"
            placeholder="contacto@..."
            type="email"
          />
          <PhoneInput name="contactPhone" label="Teléfono de contacto" />
        </div>

        <TextareaInput
          formControl={form.control}
          name="description"
          label="Descripción"
          placeholder="Breve descripción para referencia interna o pública"
          maxLength={500}
        />

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/dashboard/external_participants")}
          >
            Cancelar
          </Button>
          <SubmitButton
            disabled={
              form.formState.isSubmitting ||
              (isEditing && !form.formState.isDirty)
            }
            loading={form.formState.isSubmitting}
          >
            {isEditing ? "Guardar cambios" : "Crear participante"}
          </SubmitButton>
        </div>
      </form>
    </Form>
  );

  function ExternalParticipantImageField({
    imageUrl,
  }: {
    imageUrl?: string;
  }) {
    return (
      <FormField
        control={form.control}
        name="imageUrl"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Imagen o logo</FormLabel>
            <FormControl>
              <div className="grid gap-3">
                <div className="flex items-center gap-3 rounded-md border border-dashed p-3">
                  <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt="Vista previa"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Building2Icon className="size-7 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <UploadButton
                        config={{ cn: twMerge }}
                        endpoint="externalParticipantImage"
                        content={{
                          button({ ready, isUploading, uploadProgress }) {
                            if (isUploading && uploadProgress === 100) {
                              return (
                                <Loader2Icon className="size-4 animate-spin text-primary-500" />
                              );
                            }
                            if (isUploading)
                              return <span>{uploadProgress}%</span>;
                            if (ready) return <span>Subir imagen</span>;
                            return "Cargando...";
                          },
                          allowedContent({ ready, isUploading }) {
                            if (!ready) return null;
                            if (isUploading) return "Subiendo imagen...";
                            return "Imagen hasta 4MB";
                          },
                        }}
                        appearance={{
                          button: ({ ready, isUploading }) => {
                            if (!ready) {
                              return "bg-transparent text-xs text-muted-foreground border";
                            }
                            if (isUploading) {
                              return "bg-transparent text-xs text-muted-foreground border after:bg-primary-700/60";
                            }
                            return "bg-transparent text-xs text-foreground border hover:text-primary-500 hover:border-primary-500";
                          },
                        }}
                        onClientUploadComplete={(res) => {
                          const uploadedUrl =
                            res?.[0]?.serverData?.imageUrl ?? res?.[0]?.url;
                          if (uploadedUrl && typeof uploadedUrl === "string") {
                            field.onChange(uploadedUrl);
                            toast.success("Imagen subida");
                          } else {
                            toast.error("Respuesta de carga inválida");
                          }
                        }}
                        onUploadError={() => {
                          toast.error("Error al subir la imagen");
                        }}
                      />
                      {imageUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            const result = await deleteFile(imageUrl);
                            if (result.success) {
                              field.onChange("");
                              toast.success("Imagen eliminada");
                            } else {
                              toast.error("No se pudo eliminar la imagen");
                            }
                          }}
                        >
                          Quitar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }
}
