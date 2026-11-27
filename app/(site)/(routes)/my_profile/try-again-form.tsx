"use client";

import { prepareSignOut } from "@/app/components/impersonation/view-state";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { useClerk } from "@clerk/nextjs";
import { useForm } from "react-hook-form";

export default function TryAgainForm() {
  const { signOut } = useClerk();
  const form = useForm();

  const action = form.handleSubmit(async () => {
    // Ends a view of the app as someone else first, then forgets this
    // browser's avisos for whoever is really signed in.
    await prepareSignOut();
    signOut({
      redirectUrl: "/sign_in",
    });
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
