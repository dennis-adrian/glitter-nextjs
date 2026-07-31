import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import Heading from "@/app/components/atoms/heading";
import MyPurchaseCard from "@/app/components/programs/my-purchase-card";
import { Button } from "@/app/components/ui/button";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { fetchPurchasesForUser } from "@/app/lib/programs/purchase-queries";
import { getCurrentBaseProfile } from "@/app/lib/users/helpers";

export const metadata: Metadata = {
  title: "Mis inscripciones",
  robots: { index: false, follow: false },
};

export default async function MyProgramsPage() {
  await requireFeatureEnabled("paid_programs");

  const profile = await getCurrentBaseProfile();
  if (!profile) notFound();

  const purchases = await fetchPurchasesForUser(profile.id);

  return (
    <div className="container space-y-6 p-3 md:p-6">
      <div className="space-y-1">
        <Heading level={3}>Mis inscripciones</Heading>
        <p className="text-sm text-muted-foreground">
          Tus charlas y talleres, con el QR que necesitas para entrar.
        </p>
      </div>

      {purchases.length === 0 ? (
        <div className="space-y-3 rounded-lg border border-border/70 p-6 text-center">
          <p className="text-muted-foreground">
            Todavía no tienes inscripciones.
          </p>
          <Button asChild variant="outline">
            <Link href="/programs">Ver programas</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {purchases.map((purchase) => (
            <MyPurchaseCard key={purchase.id} purchase={purchase} />
          ))}
        </div>
      )}
    </div>
  );
}
