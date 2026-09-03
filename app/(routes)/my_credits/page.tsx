import { notFound } from "next/navigation";

import Title from "@/app/components/atoms/heading";
import CreditWallet from "@/app/components/credits/credit-wallet";
import { fetchCreditWallet } from "@/app/lib/credits/queries";
import { PARTICIPANT_READ_ONLY_ROUTE_STATUSES } from "@/app/lib/participants/definitions";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";

export default async function MyCreditsPage() {
  const currentProfile = await getCurrentUserProfile();
  await protectRoute(currentProfile || undefined, currentProfile?.id, {
    allowedStatuses: [...PARTICIPANT_READ_ONLY_ROUTE_STATUSES],
  });

  if (!currentProfile) notFound();

  const wallet = await fetchCreditWallet(currentProfile.id);
  if (!wallet) notFound();

  return (
    <div className="container p-3 md:p-6">
      <div className="mb-4 flex flex-col gap-1 md:gap-2">
        <Title>Mis créditos</Title>
        <p className="text-sm leading-tight text-muted-foreground md:text-base">
          Un crédito equivale a Bs 1. Los usás para pagar tus reservas y las
          funciones opcionales del festival.
        </p>
      </div>
      <CreditWallet wallet={wallet} profileId={currentProfile.id} />
    </div>
  );
}
