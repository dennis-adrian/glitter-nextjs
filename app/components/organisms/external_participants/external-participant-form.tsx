"use client";

import PhoneInput from "@/app/components/form/fields/phone";
import SelectInput from "@/app/components/form/fields/select";
import TextInput from "@/app/components/form/fields/text";
import TextareaInput from "@/app/components/form/fields/textarea";
import { ExternalParticipantImageUpload } from "@/app/components/uploads/external-participant-image-upload";
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
import {
  createExternalParticipant,
  updateExternalParticipant,
} from "@/app/lib/external_participants/actions";
import {
  ExternalParticipant,
  externalParticipantTypeOptions,
} from "@/app/lib/external_participants/definitions";
import { externalParticipantInputSchema } from "@/app/lib/external_participants/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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

        <FormField
          control={form.control}
          name="imageUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Imagen o logo</FormLabel>
              <FormControl>
                <ExternalParticipantImageUpload
                  imageUrl={imageUrl}
                  onChange={field.onChange}
                  onRemove={() => field.onChange("")}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
}
