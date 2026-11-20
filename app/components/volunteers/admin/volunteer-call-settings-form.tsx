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
import { updateVolunteerCallSettings } from "@/app/lib/volunteers/admin-actions";
import {
  VOLUNTEER_ADMIN_COPY,
  type VolunteerAdminCall,
} from "@/app/lib/volunteers/admin-definitions";
import {
  volunteerCallSettingsInputSchema,
  type VolunteerCallSettingsInput,
} from "@/app/lib/volunteers/admin-schema";

type Output = z.output<typeof volunteerCallSettingsInputSchema>;

/** The form's starting values: the saved dates on La Paz's clock. */
export function volunteerCallSettingsDefaults(
  festivalId: number,
  settings: VolunteerAdminCall["settings"],
): VolunteerCallSettingsInput {
  return {
    festivalId,
    applicationsCloseAt: settings
      ? toStoreDateTimeLocal(settings.applicationsCloseAt)
      : "",
    inductionDate: settings?.inductionDate ?? "",
    inductionTime: settings?.inductionTime?.slice(0, 5) ?? "",
  };
}

/**
 * When the call closes and when the induction is. Without saved settings the
 * same form opens the call for the festival.
 */
export default function VolunteerCallSettingsForm({
  festivalId,
  settings,
}: {
  festivalId: number;
  settings: VolunteerAdminCall["settings"];
}) {
  const router = useRouter();
  const isNew = settings === null;

  const form = useForm<VolunteerCallSettingsInput, unknown, Output>({
    resolver: zodResolver(volunteerCallSettingsInputSchema),
    defaultValues: volunteerCallSettingsDefaults(festivalId, settings),
  });

  const action = form.handleSubmit(async () => {
    try {
      // The action parses the raw strings itself, on La Paz's clock.
      const result = await updateVolunteerCallSettings(form.getValues());
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.refresh();
    } catch (error) {
      toastActionError(error, VOLUNTEER_ADMIN_COPY.genericError);
    }
  });

  return (
    <Form {...form}>
      <form className="grid min-w-0 gap-4" onSubmit={action} noValidate>
        <TextInput
          label="Cierre de postulaciones"
          name="applicationsCloseAt"
          type="datetime-local"
          description="Hora de Bolivia."
          required
        />
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <TextInput
            label="Fecha de la inducción"
            name="inductionDate"
            type="date"
          />
          <TextInput
            label="Hora de la inducción"
            name="inductionTime"
            type="time"
            description="Dejala vacía si todavía no está definida."
          />
        </div>
        <SubmitButton
          className="sm:w-auto sm:justify-self-start"
          disabled={form.formState.isSubmitting}
          label={isNew ? "Abrir convocatoria" : "Guardar fechas"}
          submittingLabel="Guardando..."
        />
      </form>
    </Form>
  );
}
