import { HtmlHTMLAttributes, useEffect } from "react";
import { useFormStatus } from "react-dom";

import { redirect } from "next/navigation";

import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/app/components/ui/button";
import { VariantProps } from "class-variance-authority";

export function SubmitButton({
  children,
  className,
  formState,
  redirectOnSuccess = false,
  redirectUrl,
  variant,
  size,
}: {
  formState: { message: string; success?: boolean };
  redirectOnSuccess?: boolean;
  redirectUrl?: string;
} & HtmlHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>) {
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
    <Button
      className={className}
      disabled={pending}
      type="submit"
      variant={variant}
      size={size}
    >
      {pending ? (
        <>
          <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
          Cargando
        </>
      ) : (
        children
      )}
    </Button>
  );
}
