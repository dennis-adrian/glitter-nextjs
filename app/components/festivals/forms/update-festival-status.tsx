"use client";

import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import { updateFestivalStatus } from "@/app/data/festivals/actions";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { Loader2Icon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

export default function ActivateFestivalForm({
  festival,
  onSuccess,
}: {
  festival: FestivalBase;
  onSuccess: () => void;
}) {
  const form = useForm();

  const action: () => void = form.handleSubmit(async () => {
    const status = festival.status === "active" ? "draft" : "active";
    const res = await updateFestivalStatus({ ...festival, status });
    if (res.success) {
      toast.success(res.message);
      onSuccess();
    } else toast.error(res.message);
  });

  const buttonLabel =
    festival.status === "active" ? "Deshabilitar festival" : "Activar festival";

  return (
    <Form {...form}>
      <form onSubmit={action} className="flex flex-col gap-4 mt-4">
        <Button
          disabled={form.formState.isSubmitting}
          type="submit"
          className="w-full"
        >
          {form.formState.isSubmitting ? (
            <span className="flex items-center gap-2">
              <Loader2Icon className="w-4 h-4 ml-2 animate-spin" />
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
