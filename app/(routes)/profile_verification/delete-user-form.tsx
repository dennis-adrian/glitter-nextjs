"use client";

import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import { deleteClerkUser } from "@/app/lib/users/actions";
import { useClerk, useUser } from "@clerk/nextjs";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

export default function DeleteUserForm() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const form = useForm();

  const action = async () => {
    const res = await deleteClerkUser(user!.id);
    if (res.success) {
      signOut();
      toast(res.message);
    } else {
      toast.error(res.message);
    }
  };

  return (
    <Form {...form}>
      <form className="w-full" onSubmit={form.handleSubmit(action)}>
        <Button
          disabled={
            form.formState.isSubmitting ||
            form.formState.isSubmitSuccessful ||
            !user
          }
          className="w-full border-destructive text-red-500 hover:text-destructive-foreground hover:bg-destructive"
          type="submit"
          variant="outline"
        >
          {form.formState.isSubmitting || form.formState.isSubmitSuccessful
            ? "Eliminando cuenta..."
            : "Eliminar cuenta"}
        </Button>
      </form>
    </Form>
  );
}
