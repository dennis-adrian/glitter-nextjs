"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import SelectInput from "@/app/components/form/fields/select";
import TextInput from "@/app/components/form/fields/text";
import TextareaInput from "@/app/components/form/fields/textarea";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { createProgram, updateProgram } from "@/app/lib/programs/admin-actions";
import type { Program, Venue } from "@/app/lib/programs/definitions";
import {
  dateOrNull,
  idOrNull,
  numberOrNull,
  programFormSchema,
  textOrNull,
  toDateTimeLocal,
  type ProgramFormValues,
} from "@/app/lib/programs/form-schemas";

type Props = {
  program?: Program;
  venues: Venue[];
  festivals: { id: number; name: string }[];
};

const NONE = "none";

export default function ProgramForm({ program, venues, festivals }: Props) {
  const router = useRouter();
  const isEditing = Boolean(program);

  const form = useForm<ProgramFormValues>({
    resolver: zodResolver(programFormSchema),
    defaultValues: {
      name: program?.name ?? "",
      summary: program?.summary ?? "",
      description: program?.description ?? "",
      bannerUrl: program?.bannerUrl ?? "",
      thumbnailUrl: program?.thumbnailUrl ?? "",
      startDate: toDateTimeLocal(program?.startDate).slice(0, 10),
      endDate: toDateTimeLocal(program?.endDate).slice(0, 10),
      festivalId: program?.festivalId ? String(program.festivalId) : NONE,
      defaultVenueId: program?.defaultVenueId
        ? String(program.defaultVenueId)
        : NONE,
      participantDiscountPercent:
        program?.participantDiscountPercent != null
          ? String(program.participantDiscountPercent)
          : "",
    },
  });

  const action = form.handleSubmit(async (values) => {
    const payload = {
      name: values.name,
      summary: textOrNull(values.summary),
      description: textOrNull(values.description),
      bannerUrl: textOrNull(values.bannerUrl),
      thumbnailUrl: textOrNull(values.thumbnailUrl),
      startDate: dateOrNull(values.startDate),
      endDate: dateOrNull(values.endDate),
      festivalId:
        values.festivalId === NONE ? null : idOrNull(values.festivalId),
      defaultVenueId:
        values.defaultVenueId === NONE ? null : idOrNull(values.defaultVenueId),
      participantDiscountPercent: numberOrNull(
        values.participantDiscountPercent,
      ),
    };

    try {
      const result = program
        ? await updateProgram(program.id, payload)
        : await createProgram(payload);

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);

      if ("programId" in result) {
        router.push(`/dashboard/programs/${result.programId}`);
      }
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo guardar el programa");
    }
  });

  return (
    <Form {...form}>
      <form className="grid gap-4" onSubmit={action}>
        <TextInput label="Nombre" name="name" required />
        <TextareaInput
          formControl={form.control}
          label="Resumen"
          name="summary"
          placeholder="Una o dos líneas para la tarjeta y el compartido"
        />
        <TextareaInput
          formControl={form.control}
          label="Descripción"
          name="description"
          placeholder="De qué trata el programa"
        />

        <div className="grid gap-4 md:grid-cols-2">
          <TextInput label="Fecha de inicio" name="startDate" type="date" />
          <TextInput label="Fecha de fin" name="endDate" type="date" />
        </div>

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

        <SelectInput
          formControl={form.control}
          label="Lugar por defecto"
          name="defaultVenueId"
          placeholder="Sin lugar"
          options={[
            { value: NONE, label: "Sin lugar" },
            ...venues.map((venue) => ({
              value: String(venue.id),
              label: venue.name,
            })),
          ]}
        />

        <TextInput
          label="Descuento para participantes (%)"
          name="participantDiscountPercent"
          type="number"
          min="0"
          max="100"
          step="0.01"
          description="Vacío usa el descuento global. Las sesiones pueden tener su propio precio."
        />

        <TextInput label="Imagen de portada (URL)" name="bannerUrl" />
        <TextInput label="Miniatura (URL)" name="thumbnailUrl" />

        <SubmitButton
          disabled={form.formState.isSubmitting}
          label={isEditing ? "Guardar cambios" : "Crear programa"}
        />
      </form>
    </Form>
  );
}
