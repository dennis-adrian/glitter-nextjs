import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import CreditGiftDetail from "@/app/components/credit_gifts/admin/credit-gift-detail";
import { fetchCreditGift } from "@/app/lib/credit_gifts/queries";
import { MAX_SERIAL_ID } from "@/app/lib/notifications/definitions";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

const giftIdSchema = z.coerce.number().int().positive().max(MAX_SERIAL_ID);

export default async function CreditGiftPage(props: {
  params: Promise<{ giftId: string }>;
}) {
  const parsed = giftIdSchema.safeParse((await props.params).giftId);
  if (!parsed.success) notFound();

  const [gift, actor] = await Promise.all([
    fetchCreditGift(parsed.data),
    getCurrentUserProfile(),
  ]);
  if (!gift) notFound();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Link
        href="/dashboard/credits/gifts"
        className="text-sm text-muted-foreground hover:underline"
      >
        Volver a los regalos
      </Link>
      <CreditGiftDetail
        gift={gift}
        canMutate={canMutateAdminReservations(actor)}
      />
    </div>
  );
}
