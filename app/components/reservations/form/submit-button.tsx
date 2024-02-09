import { useEffect } from "react";
import { useFormStatus } from "react-dom";

import { redirect } from "next/navigation";

import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";

export function SubmitButton({
  formState,
  redirectOnSuccess = false,
  redirectUrl,
}: {
  formState: { message: string; success?: boolean };
  redirectOnSuccess?: boolean;
  redirectUrl?: string;
}) {
  const { pending } = useFormStatus();

  useEffect(() => {
    if (pending) return;

    if (formState.message?.length > 0) {
      if (formState.success) {
        toast.success(formState.message);
        if (redirectOnSuccess && redirectUrl) redirect(redirectUrl);
      } else {
        toast.error(formState.message);
      }
    }
  }, [
    formState.message,
    formState.success,
    pending,
    redirectOnSuccess,
    redirectUrl,
  ]);

  return (
    <Button disabled={pending} type="submit">
      {pending && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
      Submit
    </Button>
  );
}
