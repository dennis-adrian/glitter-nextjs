"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import TextInput from "@/app/components/form/fields/text";
import SubmitButton from "@/app/components/simple-submit-button";
import { Card, CardContent, CardFooter } from "@/app/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { SetupCardHeader } from "@/app/components/volunteers/admin/volunteer-setup-parts";
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
 * "Fechas de la convocatoria": when the call closes and when the induction
 * is. Without saved settings the same card opens the call for the festival.
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
    <Card role="region" aria-labelledby="volunteer-dates-title">
      <Form {...form}>
        <form className="min-w-0" onSubmit={action} noValidate>
          <SetupCardHeader
            titleId="volunteer-dates-title"
            title="Fechas de la convocatoria"
            description="Hora de Bolivia. Después del cierre, la página muestra “Convocatoria cerrada” en lugar del formulario."
          />
          <CardContent className="grid min-w-0 items-start gap-4 p-4 pt-0 md:grid-cols-2 md:p-6 md:pt-0">
            <div className="min-w-0">
              <TextInput
                label="Cierre de postulaciones"
                name="applicationsCloseAt"
                type="datetime-local"
                className="min-w-0"
                required
              />
            </div>
            <FormField
              name="inductionDate"
              render={({ field }) => (
                <FormItem className="grid min-w-0 gap-2 space-y-0">
                  <FormLabel>Inducción</FormLabel>
                  <div className="flex min-w-0 flex-wrap items-start gap-2">
                    <FormControl>
                      <Input
                        type="date"
                        className="min-w-0 flex-[1_1_9rem]"
                        {...field}
                      />
                    </FormControl>
                    <FormField
                      name="inductionTime"
                      render={({ field: timeField }) => (
                        <FormItem className="min-w-0 flex-[1_1_7rem] space-y-0">
                          <FormControl>
                            <Input
                              type="time"
                              aria-label="Hora de la inducción, opcional"
                              className="min-w-0"
                              {...timeField}
                            />
                          </FormControl>
                          <FormMessage className="mt-1" />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormDescription className="break-words">
                    La hora es opcional. Si dejás la fecha vacía, la página dice
                    “fecha por confirmar”.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="p-4 pt-0 md:p-6 md:pt-0">
            <SubmitButton
              className="min-h-11 sm:w-auto md:min-h-10"
              wrap
              disabled={form.formState.isSubmitting}
              label={isNew ? "Abrir convocatoria" : "Guardar fechas"}
              submittingLabel="Guardando..."
            />
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
