"use client";

import type { FestivalAvailableUser } from "@/app/lib/festivals/definitions";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { sendParticipantInvitationsToUsers } from "@/app/lib/festivals/invitations";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

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
    const result = await sendParticipantInvitationsToUsers(
      festivalId,
      users.map((user) => user.id),
    );
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
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
