"use client";

import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import { updateFestivalRegistration } from "@/app/lib/festivals/actions";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import { Loader2Icon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

export default function UpdateFestivalRegistrationForm({
  festival,
  onSuccess,
}: {
  festival: FestivalBase;
  onSuccess: () => void;
}) {
  const form = useForm();

  const action: () => void = form.handleSubmit(async () => {
    const res = await updateFestivalRegistration({
      ...festival,
      publicRegistration: !festival.publicRegistration,
    });

    if (res.success) {
      toast.success(res.message);
      onSuccess();
    } else toast.error(res.message);
  });

  const buttonLabel = festival.publicRegistration
    ? "Deshabilitar acreditación"
    : "Habilitar acreditación";

  return (
    <Form {...form}>
      <form onSubmit={action} className="flex flex-col gap-4 mt-4">
        <Button disabled={form.formState.isSubmitting} className="w-full">
          {form.formState.isSubmitting ? (
            <span className="flex items-center gap-2">
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
