"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { resendCreditGiftNotificationAction } from "@/app/lib/credit_gifts/actions";

/**
 * Mails the gift notice again. Never credits again. When it cannot be used,
 * it stays visible, disabled, with the reason on hover and for screen
 * readers; the email column next to it says the same in words.
 */
export default function CreditGiftResendButton({
  campaignId,
  userId,
  disabledReason,
}: {
  campaignId: number;
  userId: number;
  disabledReason: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={disabledReason != null || isPending}
      title={disabledReason ?? undefined}
      aria-label={
        disabledReason ? `Reenviar aviso: ${disabledReason}` : undefined
      }
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
