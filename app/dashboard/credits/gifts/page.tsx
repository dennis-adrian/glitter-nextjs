import { notFound } from "next/navigation";

import CreditGiftsList from "@/app/components/credit_gifts/admin/credit-gifts-list";
import { creditGiftBlocker } from "@/app/lib/credit_gifts/access";
import { listCreditGifts } from "@/app/lib/credit_gifts/queries";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function CreditGiftsPage() {
  const [gifts, actor] = await Promise.all([
    listCreditGifts(),
    getCurrentUserProfile(),
  ]);
  if (!gifts) notFound();

  return (
    <CreditGiftsList gifts={gifts} blocker={await creditGiftBlocker(actor)} />
  );
}
