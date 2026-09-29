"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import ProgramImageUpload from "@/app/components/dashboard/programs/program-image-upload";
import CreatableComboboxInput from "@/app/components/form/fields/creatable-combobox";
import SelectInput from "@/app/components/form/fields/select";
import TextInput from "@/app/components/form/fields/text";
import TextareaInput from "@/app/components/form/fields/textarea";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { createSession, updateSession } from "@/app/lib/programs/admin-actions";
import {
  SESSION_AUDIENCE_LABELS,
  SESSION_SKILL_LEVEL_LABELS,
  SESSION_TYPE_LABELS,
  type ProgramSession,
  type Venue,
} from "@/app/lib/programs/definitions";
import {
  arrayToLines,
  idOrNull,
  linesToArray,
  numberOrNull,
  sessionFormSchema,
  textOrNull,
} from "@/app/lib/programs/form-schemas";
import { sessionAdminPath } from "@/app/lib/programs/paths";

type Props = {
  /** Null for a standalone session, which picks its own festival instead. */
  programId: number | null;
  session?: ProgramSession;
  venues: Venue[];
  /** Topics already used by other sessions, for the picker. */
  topics: string[];
  /** Options for a standalone session's festival; unused inside a program. */
  festivals?: { id: number; name: string }[];
  /** False for a festival admin: the image upload endpoint is admin-only. */
  canUploadImages: boolean;
};

const NONE = "none";

// The festival only exists on a standalone session, so it extends the shared
// schema here rather than appearing on every session form.
const formSchema = sessionFormSchema.extend({
  festivalId: z.string().trim().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function SessionForm({
  programId,
  session,
  venues,
  topics,
  festivals = [],
  canUploadImages,
}: Props) {
  const router = useRouter();
  const isEditing = Boolean(session);
  const isStandalone = programId === null;
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      festivalId: session?.festivalId ? String(session.festivalId) : NONE,
      title: session?.title ?? "",
      type: session?.type ?? "talk",
      audience: session?.audience ?? "all",
      topic: session?.topic ?? "",
      description: session?.description ?? "",
      learningOutcomes: arrayToLines(session?.learningOutcomes),
      skillLevel: session?.skillLevel ?? NONE,
      imageUrl: session?.imageUrl ?? "",
      publicPrice: session ? String(session.publicPrice) : "0",
      participantPrice:
        session?.participantPrice != null
          ? String(session.participantPrice)
          : "",
      venueId: session?.venueId ? String(session.venueId) : NONE,
      displayOrder: session ? String(session.displayOrder) : "0",
    },
  });

  const action = form.handleSubmit(async (values) => {
    const publicPrice = numberOrNull(values.publicPrice);

    if (publicPrice === null) {
      toast.error("El precio público debe ser un número");
      return;
    }

    const payload = {
      programId,
      festivalId:
        isStandalone && values.festivalId !== NONE
          ? idOrNull(values.festivalId)
          : null,
      title: values.title,
      type: values.type,
      audience: values.audience,
      topic: textOrNull(values.topic),
      description: textOrNull(values.description),
      learningOutcomes: linesToArray(values.learningOutcomes),
      skillLevel:
        values.skillLevel === NONE || !values.skillLevel
          ? null
          : (values.skillLevel as "beginner" | "intermediate" | "advanced"),
      imageUrl: textOrNull(values.imageUrl),
      publicPrice,
      participantPrice: numberOrNull(values.participantPrice),
      venueId: values.venueId === NONE ? null : idOrNull(values.venueId),
      displayOrder: numberOrNull(values.displayOrder) ?? 0,
    };

    try {
      const result = session
        ? await updateSession(session.id, payload)
        : await createSession(payload);

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);

      if ("sessionId" in result) {
        router.push(sessionAdminPath({ id: result.sessionId, programId }));
      }
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo guardar la sesión");
    }
  });

  return (
    <Form {...form}>
      <form className="grid gap-4" onSubmit={action}>
        <TextInput
          label="Título"
          name="title"
          placeholder="Cómo cobrar por tu trabajo sin morir en el intento"
          description="El nombre de esta sesión en particular."
          required
        />

        {isStandalone ? (
          <SelectInput
            formControl={form.control}
            label="Festival asociado"
            name="festivalId"
            placeholder="Sin festival"
            options={[
              { value: NONE, label: "Sin festival" },
              ...festivals.map((festival) => ({
                value: String(festival.id),
                label: festival.name,
              })),
            ]}
          />
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <SelectInput
            formControl={form.control}
            label="Tipo"
            name="type"
            options={(["talk", "workshop"] as const).map((value) => ({
              value,
              label: SESSION_TYPE_LABELS[value],
            }))}
            required
          />
          <SelectInput
            formControl={form.control}
            label="Público"
            name="audience"
            options={(["all", "participants_only", "public_only"] as const).map(
              (value) => ({
                value,
                label: SESSION_AUDIENCE_LABELS[value],
              }),
            )}
            required
          />
        </div>

        <CreatableComboboxInput
          form={form}
          name="topic"
          label="Tema o categoría"
          placeholder="Elegir o crear un tema"
          description="El área a la que pertenece la sesión, no su título. Elige uno ya en uso para agrupar sesiones que tratan lo mismo."
          options={topics}
          emptyLabel="Aún no hay temas. Escribe para crear el primero."
        />
        <TextareaInput
          formControl={form.control}
          label="Descripción"
          name="description"
          placeholder="De qué trata la sesión"
        />
        <TextareaInput
          formControl={form.control}
          label="Qué te llevas"
          maxLength={2000}
          name="learningOutcomes"
          placeholder="Una línea por punto"
        />

        <div className="md:max-w-sm">
          <ProgramImageUpload
            control={form.control}
            name="imageUrl"
            label="Imagen de la sesión"
            description="Recomendado: 1600 × 1200 px (4:3)."
            previewClassName="aspect-4/3"
            previewSizes="(min-width: 768px) 24rem, 90vw"
            onUploading={setIsUploadingImage}
            uploadDisabledReason={
              canUploadImages
                ? undefined
                : "Solo el equipo de administración puede subir imágenes."
            }
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <SelectInput
            formControl={form.control}
            label="Nivel"
            name="skillLevel"
            placeholder="Sin nivel"
            options={[
              { value: NONE, label: "Sin nivel" },
              ...(["beginner", "intermediate", "advanced"] as const).map(
                (value) => ({
                  value,
                  label: SESSION_SKILL_LEVEL_LABELS[value],
                }),
              ),
            ]}
          />
          {/* A standalone session has no program default to fall back on. */}
          <SelectInput
            formControl={form.control}
            label={isStandalone ? "Lugar" : "Lugar (si difiere del programa)"}
            name="venueId"
            placeholder={isStandalone ? "Sin lugar" : "Hereda del programa"}
            options={[
              {
                value: NONE,
                label: isStandalone ? "Sin lugar" : "Hereda del programa",
              },
              ...venues.map((venue) => ({
                value: String(venue.id),
                label: venue.name,
              })),
            ]}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <TextInput
            label="Precio público (Bs)"
            name="publicPrice"
            type="number"
            min="0"
            step="0.01"
            required
          />
          <TextInput
            label="Precio participantes (Bs)"
            name="participantPrice"
            type="number"
            min="0"
            step="0.01"
            description={
              isStandalone
                ? "Vacío aplica el descuento global."
                : "Vacío aplica el descuento del programa o el global."
            }
          />
        </div>

        <TextInput
          label="Orden"
          name="displayOrder"
          type="number"
          min="0"
          step="1"
        />

        <SubmitButton
          disabled={form.formState.isSubmitting || isUploadingImage}
          label={isEditing ? "Guardar cambios" : "Crear sesión"}
        />
      </form>
    </Form>
  );
}
