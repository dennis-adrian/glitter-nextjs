"use client";

import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { sendUserEmailsTemp } from "@/app/lib/festivals/actions";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type SendEmailsFormProps = {
  userIds: number[];
  festivalId: number;
};

export default function SendEmailsForm({
  userIds,
  festivalId,
}: SendEmailsFormProps) {
  const form = useForm();

  const action = form.handleSubmit(async () => {
    const res = await sendUserEmailsTemp(userIds, festivalId);
    if (!res.success) toast.error(res.message);
  });

  return (
    <Form {...form}>
      <form onSubmit={action}>
        <SubmitButton
          disabled={form.formState.isSubmitting}
          loading={form.formState.isSubmitting}
          label="Enviar correos"
        />
      </form>
    </Form>
  );
}
