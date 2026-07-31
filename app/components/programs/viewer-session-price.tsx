"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";

import type { ParticipantEligibility } from "@/app/lib/programs/eligibility";
import { formatMoney } from "@/app/lib/programs/pricing";
import { getCurrentViewerProgramEligibility } from "@/app/lib/programs/registration-actions";

type Props = {
  publicPrice: number;
  participantPrice: number;
};

export default function ViewerSessionPrice({
  publicPrice,
  participantPrice,
}: Props) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [result, setResult] = useState<{
    userId: string;
    eligibility: ParticipantEligibility | null;
  } | null>(null);

  useEffect(() => {
    let active = true;

    if (!isLoaded || !isSignedIn || !userId) {
      return () => {
        active = false;
      };
    }

    void getCurrentViewerProgramEligibility().then(
      (nextEligibility) => {
        if (active) setResult({ userId, eligibility: nextEligibility });
      },
      () => {
        if (active) setResult({ userId, eligibility: null });
      },
    );

    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn, userId]);

  const viewerEligibility = isSignedIn
    ? result?.userId === userId
      ? result.eligibility
      : undefined
    : "public";

  if (!isLoaded || viewerEligibility === undefined) {
    return (
      <span aria-label="Calculando tu precio" className="inline-block min-w-20">
        …
      </span>
    );
  }

  if (viewerEligibility === null) {
    return <span aria-label="No pudimos calcular tu precio">—</span>;
  }

  const viewerPrice =
    viewerEligibility === "active_participant" ? participantPrice : publicPrice;

  return <span aria-live="polite">{formatMoney(viewerPrice)}</span>;
}
