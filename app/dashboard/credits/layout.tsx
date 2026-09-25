import Heading from "@/app/components/atoms/heading";
import CreditsNav from "@/app/components/credits/admin/credits-nav";
import { fetchCreditAttentionCounts } from "@/app/lib/credits/admin-queries";

export default async function CreditsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const counts = await fetchCreditAttentionCounts();

  return (
    <div className="container space-y-4 px-3 py-4 md:px-6 md:py-6">
      <div className="space-y-2">
        <Heading level={2}>Créditos</Heading>
        <p className="text-sm text-muted-foreground md:text-base">
          Cuántos créditos hay en circulación, quién tiene cuántos y cada
          movimiento que los creó, usó o corrigió.
        </p>
      </div>

      <CreditsNav
        pendingReviews={counts.pendingReviews}
        debtAccounts={counts.debtAccounts}
      />

      {children}
    </div>
  );
}
