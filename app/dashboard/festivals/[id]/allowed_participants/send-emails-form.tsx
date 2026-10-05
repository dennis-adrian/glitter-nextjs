"use client";

import type { FestivalAvailableUser } from "@/app/lib/festivals/definitions";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { sendUserEmailsTemp } from "@/app/lib/festivals/actions";
import { useForm } from "react-hook-form";

type SendEmailsFormProps = {
  users: Pick<FestivalAvailableUser, "id">[];
  festivalId: number;
};

export default function SendEmailsForm({
  users,
  festivalId,
}: SendEmailsFormProps) {
  const form = useForm();

  const action = form.handleSubmit(async () => {
    await sendUserEmailsTemp(
      users.map((user) => user.id),
      festivalId,
    );
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
