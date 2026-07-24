"use client";

import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { archiveFestival } from "@/app/lib/festivals/actions";
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
    const res = await archiveFestival(props.festival.id);
    if (!res.success) {
      toast.error(res.message);
      return;
    }

    toast.success(res.message);
    props.onSuccess();
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
