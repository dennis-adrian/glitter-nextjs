"use client";

import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import { updateFestival } from "@/app/lib/festivals/actions";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import { Loader2Icon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

export default function UpdateEventDayRegistrationForm({
  festival,
  onSuccess,
}: {
  festival: FestivalBase;
  onSuccess: () => void;
}) {
  const form = useForm();

  const action: () => void = form.handleSubmit(async () => {
    const res = await updateFestival({
      ...festival,
      eventDayRegistration: !festival.eventDayRegistration,
    });
    if (res.success) {
      toast.success(res.message);
      onSuccess();
    } else toast.error(res.message);
  });

  const buttonLabel = festival.eventDayRegistration
    ? "Deshabilitar registro en puerta"
    : "Habilitar registro en puerta";

  return (
    <Form {...form}>
      <form onSubmit={action} className="flex flex-col gap-4 mt-4">
        <Button
          disabled={form.formState.isSubmitting}
          type="submit"
          className="w-full"
        >
          {form.formState.isSubmitting ? (
            <span className="flex gap-2 items-center">
              <Loader2Icon className="w-4 h-4 animate-spin" />
              Actualizando festival
            </span>
          ) : (
            <span>{buttonLabel}</span>
          )}
        </Button>
      </form>
    </Form>
  );
}
