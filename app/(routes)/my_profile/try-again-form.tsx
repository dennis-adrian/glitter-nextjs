"use client";

import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { deleteClerkUser } from "@/app/lib/users/actions";
import { useClerk } from "@clerk/nextjs";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

export default function TryAgainForm({ clerkId }: { clerkId: string }) {
  const { signOut } = useClerk();
  const form = useForm();

  const action = form.handleSubmit(async () => {
    const res = await deleteClerkUser(clerkId);

    if (res.success) {
      signOut({
        redirectUrl: "/sign_up",
      });
    } else {
      toast.error(res.message);
    }
  });

  return (
    <Form {...form}>
      <form className="mt-2" onSubmit={action}>
        <SubmitButton
          disabled={
            form.formState.isSubmitting || form.formState.isSubmitSuccessful
          }
          loading={
            form.formState.isSubmitting ||
            form.formState.isSubmitSuccessful ||
            form.formState.isLoading
          }
        >
          Intentar nuevamente
        </SubmitButton>
      </form>
    </Form>
  );
}
