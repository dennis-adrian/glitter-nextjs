import type { Metadata } from "next";
import { notFound } from "next/navigation";

import FastPassPosSaleForm from "@/app/components/fast-pass/pos/pos-sale-form";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { fetchFastPassPosContext } from "@/app/lib/fast-pass/pos-actions";

export const metadata: Metadata = {
  title: "POS Pase Rápido",
  robots: { index: false, follow: false },
};

export default async function FastPassPosPage(props: {
  params: Promise<{ credential: string }>;
}) {
  await requireFeatureEnabled("fast_pass");

  const params = await props.params;
  const credential = params.credential;
  if (!credential.trim()) notFound();

  const context = await fetchFastPassPosContext(credential);
  if (!context) notFound();

  return (
    <div className="min-h-dvh bg-background px-3 py-4">
      <FastPassPosSaleForm credential={credential} context={context} />
    </div>
  );
}
