import { notFound } from "next/navigation";

import CreditPurchase from "@/app/components/credits/credit-purchase";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { fetchCreditTopUpForOwner } from "@/app/lib/credits/queries";
import { PARTICIPANT_READ_ONLY_ROUTE_STATUSES } from "@/app/lib/participants/definitions";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";

export default async function CreditPurchasePage(props: {
  params: Promise<{ topUpId: string }>;
}) {
  await requireFeatureEnabled("credits");

  const currentProfile = await getCurrentUserProfile();
  await protectRoute(currentProfile || undefined, currentProfile?.id, {
    allowedStatuses: [...PARTICIPANT_READ_ONLY_ROUTE_STATUSES],
  });
  if (!currentProfile) notFound();

  const { topUpId } = await props.params;
  const parsedId = Number(topUpId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) notFound();

  // Owner-scoped: somebody else's amount and deadline are not theirs to read,
  // so a wrong id is indistinguishable from one that does not exist.
  const topUp = await fetchCreditTopUpForOwner(parsedId, currentProfile.id);
  if (!topUp) notFound();

  return <CreditPurchase topUp={topUp} />;
}
