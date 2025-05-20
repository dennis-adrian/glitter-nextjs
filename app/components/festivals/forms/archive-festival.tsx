"use client";

import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { updateFestival } from "@/app/lib/festivals/actions";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type ArchiveFestivalFormProps = {
  festival: FestivalBase;
  onSuccess: () => void;
};

export default function ArchiveFestivalForm(props: ArchiveFestivalFormProps) {
  const form = useForm();

  const action: () => void = form.handleSubmit(async () => {
    const res = await updateFestival({
      ...props.festival,
      status: "archived",
      publicRegistration: false,
      eventDayRegistration: false,
    });

    if (res.success) {
      toast.success(res.message);
      props.onSuccess();
    } else {
      toast.error(res.message);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={action}>
        <SubmitButton
          disabled={form.formState.isSubmitting}
          label="Archivar festival"
          loading={form.formState.isSubmitting}
        />
      </form>
    </Form>
  );
}
