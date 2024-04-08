"use client";

import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import { activateFestival } from "@/app/data/festivals/actions";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { Loader2Icon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

export default function ActiveFestivalForm({
  festival,
}: {
  festival: FestivalBase;
}) {
  const form = useForm();

  async function handleSubmit() {
    const res = await activateFestival(festival);
    if (res.success) {
      toast.success(res.message);
    } else toast.error(res.message);
  }

  return (
    <Form {...form}>
      <form action={handleSubmit} className="flex flex-col gap-4 mt-4">
        <Button
          disabled={form.formState.isSubmitting}
          type="submit"
          className="w-full"
        >
          {form.formState.isSubmitting ? (
            <span>
              <Loader2Icon className="w-4 h-4 ml-2 animate-spin" />
              Activando festival
            </span>
          ) : (
            <span>Activar festival</span>
          )}
        </Button>
      </form>
    </Form>
  );
}
