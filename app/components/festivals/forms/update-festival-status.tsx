"use client";

import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import {
  getFestivalAvailableUsers,
  sendUserEmailsTemp,
  updateFestivalStatusTemp,
} from "@/app/lib/festivals/actions";
import { FestivalBase } from "@/app/lib/festivals/definitions";
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
    const res = await updateFestivalStatusTemp({ ...festival, status });
    if (res.success) {
      toast.success(res.message);
      if (status === "active") {
        const loadingToast = toast.loading("Enviando correos...");
        const availableUsers = await getFestivalAvailableUsers(festival.id);
        const gastronomyUserIds = availableUsers
          .filter((user) => user.category === "gastronomy")
          .map((user) => user.id);
        await sendUserEmailsTemp(gastronomyUserIds, festival.id);
        const entrepreneurshipUserIds = availableUsers
          .filter((user) => user.category === "entrepreneurship")
          .map((user) => user.id);
        await sendUserEmailsTemp(entrepreneurshipUserIds, festival.id);
        const illustrationUserIds = availableUsers
          .filter((user) => user.category === "illustration")
          .map((user) => user.id);
        await sendUserEmailsTemp(illustrationUserIds, festival.id);
        toast.dismiss(loadingToast);
      }
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
