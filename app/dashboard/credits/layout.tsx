import CreditsNav from "@/app/components/credits/admin/credits-nav";
import { fetchCreditAttentionCounts } from "@/app/lib/credits/admin-queries";

export default async function CreditsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const counts = await fetchCreditAttentionCounts();

  return (
    // Fills the dashboard's viewport-tall shell; each page below fills what
    // is left, so tables scroll inside themselves instead of the page.
    <div className="container flex min-h-0 flex-1 flex-col gap-3 px-3 py-3 md:px-6 md:py-4">
      <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold md:text-2xl">Créditos</h1>
          <p className="text-sm text-muted-foreground">
            Cuántos créditos hay en circulación, quién tiene cuántos y cada
            movimiento que los creó, usó o corrigió.
          </p>
        </div>
        <CreditsNav
          pendingReviews={counts.pendingReviews}
          debtAccounts={counts.debtAccounts}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
