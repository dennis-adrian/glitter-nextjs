"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import SelectInput from "@/app/components/form/fields/select";
import TextInput from "@/app/components/form/fields/text";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import type { SessionOccurrence, Venue } from "@/app/lib/programs/definitions";
import {
  dateOrNull,
  idOrNull,
  numberOrNull,
  occurrenceFormSchema,
  textOrNull,
  toDateTimeLocal,
  type OccurrenceFormValues,
} from "@/app/lib/programs/form-schemas";
import {
  createOccurrence,
  updateOccurrence,
} from "@/app/lib/programs/occurrence-actions";

type Props = {
  sessionId: number;
  occurrence?: SessionOccurrence;
  venues: Venue[];
  defaultCapacity: number;
  onSaved?: () => void;
};

const NONE = "none";

export default function OccurrenceForm({
  sessionId,
  occurrence,
  venues,
  defaultCapacity,
  onSaved,
}: Props) {
  const router = useRouter();
  const isEditing = Boolean(occurrence);

  const form = useForm<OccurrenceFormValues>({
    resolver: zodResolver(occurrenceFormSchema),
    defaultValues: {
      startsAt: toDateTimeLocal(occurrence?.startsAt),
      endsAt: toDateTimeLocal(occurrence?.endsAt),
      venueId: occurrence?.venueId ? String(occurrence.venueId) : NONE,
      room: occurrence?.room ?? "",
      capacity: String(occurrence?.capacity ?? defaultCapacity),
      salesStartAt: toDateTimeLocal(occurrence?.salesStartAt),
      salesEndAt: toDateTimeLocal(occurrence?.salesEndAt),
    },
  });

  const action = form.handleSubmit(async (values) => {
    const startsAt = dateOrNull(values.startsAt);
    const endsAt = dateOrNull(values.endsAt);
    const capacity = numberOrNull(values.capacity);

    if (!startsAt || !endsAt) {
      toast.error("Las fechas de inicio y fin son obligatorias");
      return;
    }

    if (capacity === null || !Number.isInteger(capacity) || capacity < 1) {
      toast.error("Los cupos deben ser un número entero mayor a cero");
      return;
    }

    const payload = {
      sessionId,
      startsAt,
      endsAt,
      venueId: values.venueId === NONE ? null : idOrNull(values.venueId),
      room: textOrNull(values.room),
      capacity,
      salesStartAt: dateOrNull(values.salesStartAt),
      salesEndAt: dateOrNull(values.salesEndAt),
    };

    try {
      const result = occurrence
        ? await updateOccurrence(occurrence.id, payload)
        : await createOccurrence(payload);

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      if (!occurrence) form.reset();
      onSaved?.();
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo guardar el horario");
    }
  });

  return (
    <Form {...form}>
      <form className="grid gap-4" onSubmit={action}>
        <div className="grid gap-4 md:grid-cols-2">
          <TextInput
            label="Inicio"
            name="startsAt"
            type="datetime-local"
            required
          />
          <TextInput label="Fin" name="endsAt" type="datetime-local" required />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <SelectInput
            formControl={form.control}
            label="Lugar"
            name="venueId"
            placeholder="Hereda de la sesión"
            options={[
              { value: NONE, label: "Hereda de la sesión" },
              ...venues.map((venue) => ({
                value: String(venue.id),
                label: venue.name,
              })),
            ]}
          />
          <TextInput label="Sala" name="room" />
        </div>

        <TextInput
          label="Cupos"
          name="capacity"
          type="number"
          min="1"
          step="1"
          required
        />

        <div className="grid gap-4 md:grid-cols-2">
          <TextInput
            label="Apertura de ventas"
            name="salesStartAt"
            type="datetime-local"
            description="Vacío abre en cuanto se publique."
          />
          <TextInput
            label="Cierre de ventas"
            name="salesEndAt"
            type="datetime-local"
            description="Vacío mantiene la venta abierta."
          />
        </div>

        <SubmitButton
          disabled={form.formState.isSubmitting}
          label={isEditing ? "Guardar horario" : "Agregar horario"}
        />
      </form>
    </Form>
  );
}
