import type { Metadata } from "next";

import FastPassRecoverForm from "@/app/components/fast-pass/public/recover-form";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";

export const metadata: Metadata = {
  title: "Recuperar Pase Rápido",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ purchaseId?: string | string[] }>;
};

export default async function FastPassRecoverPage({ searchParams }: Props) {
  await requireFeatureEnabled("fast_pass");
  const { purchaseId } = await searchParams;
  const initialPurchaseId = Array.isArray(purchaseId)
    ? (purchaseId[0] ?? "")
    : (purchaseId ?? "");

  return (
    <div className="container mx-auto max-w-md space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Recuperar compra</h1>
        <p className="text-sm text-muted-foreground">
          Recuperá el enlace seguro de tu Pase Rápido sin crear una cuenta.
        </p>
      </header>
      <FastPassRecoverForm initialPurchaseId={initialPurchaseId} />
    </div>
  );
}
