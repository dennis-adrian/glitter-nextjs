"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { resendCreditGiftNotificationAction } from "@/app/lib/credit_gifts/actions";

/** Mails the gift notice again. Never credits again. */
export default function CreditGiftResendButton({
  campaignId,
  userId,
  disabled,
}: {
  campaignId: number;
  userId: number;
  disabled: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={disabled || isPending}
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await resendCreditGiftNotificationAction({
              campaignId,
              userId,
            });
            if (result.success) toast.success(result.message);
            else toast.error(result.message);
            router.refresh();
          } catch (error) {
            console.error("Error resending a credit gift notice", error);
            toast.error("No pudimos reenviar el aviso. Intentá de nuevo.");
          }
        })
      }
    >
      {isPending ? "Reenviando…" : "Reenviar aviso"}
    </Button>
  );
}
