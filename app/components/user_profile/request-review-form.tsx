"use client";

import { useForm } from "react-hook-form";
import { Loader2Icon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import { requestProfileReview } from "@/app/lib/users/actions";

type RequestReviewFormProps = {
  profileId: number;
  /** Why the profile cannot ask yet; shown under the disabled button. */
  disabledReason?: string;
};

const FAILURE_MESSAGE =
  "No pudimos pedir la nueva revisión. Intentá de nuevo en unos minutos.";

/**
 * Sends a rejected profile back to review. On success the server revalidates
 * the page, which then renders the pending state instead of this button.
 */
export default function RequestReviewForm({
  profileId,
  disabledReason,
}: RequestReviewFormProps) {
  const form = useForm();

  const action: () => void = form.handleSubmit(async () => {
    let res;
    try {
      res = await requestProfileReview(profileId);
    } catch (error) {
      console.error("Error requesting profile review", error);
      toast.error(FAILURE_MESSAGE);
      return;
    }

    if (res.success) {
      toast.success("Solicitud enviada", { description: res.message });
    } else {
      toast.error(res.message);
    }
  });

  return (
    <Form {...form}>
      <form className="w-full" onSubmit={action}>
        <Button
          className="w-full"
          disabled={disabledReason != null || form.formState.isSubmitting}
          title={disabledReason}
          type="submit"
          variant="outline"
        >
          {form.formState.isSubmitting ? (
            <>
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <RotateCcwIcon className="mr-2 h-4 w-4" />
              Pedir una nueva revisión
            </>
          )}
        </Button>
        {disabledReason && (
          <p className="mt-2 text-xs text-muted-foreground">{disabledReason}</p>
        )}
      </form>
    </Form>
  );
}
