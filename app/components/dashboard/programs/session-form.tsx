"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

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
  type SessionFormValues,
} from "@/app/lib/programs/form-schemas";

type Props = {
  programId: number;
  session?: ProgramSession;
  venues: Venue[];
  /** Topics already used by other sessions, for the picker. */
  topics: string[];
};

const NONE = "none";

export default function SessionForm({
  programId,
  session,
  venues,
  topics,
}: Props) {
  const router = useRouter();
  const isEditing = Boolean(session);

  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: {
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
        router.push(
          `/dashboard/programs/${programId}/sessions/${result.sessionId}`,
        );
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
          name="learningOutcomes"
          placeholder="Una línea por punto"
        />

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
          <SelectInput
            formControl={form.control}
            label="Lugar (si difiere del programa)"
            name="venueId"
            placeholder="Hereda del programa"
            options={[
              { value: NONE, label: "Hereda del programa" },
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
            description="Vacío aplica el descuento del programa o el global."
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <TextInput label="Imagen (URL)" name="imageUrl" />
          <TextInput
            label="Orden"
            name="displayOrder"
            type="number"
            min="0"
            step="1"
          />
        </div>

        <SubmitButton
          disabled={form.formState.isSubmitting}
          label={isEditing ? "Guardar cambios" : "Crear sesión"}
        />
      </form>
    </Form>
  );
}
