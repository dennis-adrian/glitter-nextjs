"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import TextInput from "@/app/components/form/fields/text";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { toastActionError } from "@/app/lib/errors/action-error";
import { toStoreDateTimeLocal } from "@/app/lib/schedule-time";
import { saveVolunteerShift } from "@/app/lib/volunteers/admin-actions";
import {
  VOLUNTEER_ADMIN_COPY,
  type VolunteerAdminShift,
} from "@/app/lib/volunteers/admin-definitions";
import {
  volunteerShiftInputSchema,
  type VolunteerShiftInput,
} from "@/app/lib/volunteers/admin-schema";

type Output = z.output<typeof volunteerShiftInputSchema>;

/** The form's starting values: an existing shift on La Paz's clock. */
export function volunteerShiftDefaults(
  festivalId: number,
  shift: VolunteerAdminShift | undefined,
  nextSortOrder = 0,
): VolunteerShiftInput {
  return {
    festivalId,
    shiftId: shift?.id,
    label: shift?.label ?? "",
    startsAt: shift ? toStoreDateTimeLocal(shift.startsAt) : "",
    endsAt: shift ? toStoreDateTimeLocal(shift.endsAt) : "",
    neededHeadcount: String(shift?.neededHeadcount ?? 0),
    sortOrder: String(shift?.sortOrder ?? nextSortOrder),
  };
}

/** Creates a shift, or edits `shift` when given. Times are Bolivia's. */
export default function VolunteerShiftForm({
  festivalId,
  shift,
  nextSortOrder = 0,
  onSaved,
}: {
  festivalId: number;
  shift?: VolunteerAdminShift;
  /** The order a new shift starts with: after the last one. */
  nextSortOrder?: number;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const form = useForm<VolunteerShiftInput, unknown, Output>({
    resolver: zodResolver(volunteerShiftInputSchema),
    defaultValues: volunteerShiftDefaults(festivalId, shift, nextSortOrder),
  });

  const action = form.handleSubmit(async (values) => {
    try {
      // The raw datetime-local strings: the action reads them as La Paz time.
      const result = await saveVolunteerShift(form.getValues());
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      if (!shift) {
        form.reset(
          volunteerShiftDefaults(festivalId, undefined, values.sortOrder + 1),
        );
      }
      onSaved?.();
      router.refresh();
    } catch (error) {
      toastActionError(error, VOLUNTEER_ADMIN_COPY.genericError);
    }
  });

  return (
    <Form {...form}>
      <form className="grid min-w-0 gap-4" onSubmit={action} noValidate>
        <TextInput
          label="Nombre del turno"
          name="label"
          placeholder="Montaje, Tarde, Cierre..."
          maxLength={120}
          required
        />
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <TextInput
            label="Inicio"
            name="startsAt"
            type="datetime-local"
            description="Hora de Bolivia."
            required
          />
          <TextInput label="Fin" name="endsAt" type="datetime-local" required />
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-4 sm:max-w-sm">
          <TextInput
            label="Cupo"
            name="neededHeadcount"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            required
          />
          <TextInput
            label="Orden"
            name="sortOrder"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            required
          />
        </div>
        <SubmitButton
          className="sm:w-auto sm:justify-self-start"
          disabled={form.formState.isSubmitting}
          label={shift ? "Guardar turno" : "Agregar turno"}
          submittingLabel="Guardando..."
        />
      </form>
    </Form>
  );
}
