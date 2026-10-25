import Link from "next/link";
import { notFound } from "next/navigation";

import CreditGiftComposer from "@/app/components/credit_gifts/admin/credit-gift-composer";
import type { CreditGiftListOptions } from "@/app/components/credit_gifts/admin/credit-gift-list-picker";
import { Banner } from "@/app/components/ui/banner";
import {
  creditGiftBlocker,
  creditGiftListsAvailability,
} from "@/app/lib/credit_gifts/access";
import {
  fetchFestivalLists,
  fetchSavedLists,
} from "@/app/lib/distribution_lists/queries";
import { canViewAdminReservationData } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function NewCreditGiftPage() {
  const actor = await getCurrentUserProfile();
  if (!canViewAdminReservationData(actor)) notFound();
  const blocker = await creditGiftBlocker(actor);
  const availability = blocker
    ? "hidden"
    : await creditGiftListsAvailability(actor);
  // Counted only where the button works: elsewhere it is hidden or disabled.
  const [festivals, saved] =
    availability === "enabled"
      ? await Promise.all([fetchFestivalLists(), fetchSavedLists()])
      : [[], []];
  const lists: CreditGiftListOptions = { availability, festivals, saved };

  return (
    <div className="space-y-4 overflow-y-auto pb-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Regalar créditos</h2>
        <Link
          href="/dashboard/credits/gifts"
          className="text-sm text-muted-foreground hover:underline"
        >
          Volver a los regalos
        </Link>
      </div>
      {blocker ? (
        <Banner variant="warning" title="No podés regalar créditos todavía">
          {blocker}
        </Banner>
      ) : (
        <CreditGiftComposer lists={lists} />
      )}
    </div>
  );
}
