import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import FestivalFinanceView, {
  FinanceEmptyState,
  FinanceHeader,
} from "@/app/components/festivals/finance/festival-finance-view";
import { fetchFestivalFinance } from "@/app/lib/festivals/finance/queries";
import { requireAdmin } from "@/app/lib/users/helpers";

const ParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const metadata: Metadata = { title: "Finanzas" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // Admins only: festival admins pass the dashboard layout but not this page,
  // and a missing page tells them nothing a refusal would.
  if (!(await requireAdmin())) notFound();

  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();

  const finance = await fetchFestivalFinance(parsed.data.id);
  if (!finance) notFound();

  const s = finance.summary;
  const empty = finance.rows.length === 0 && s.extras.length === 0 && s.free.count === 0;

  return (
    <div className="container flex flex-col gap-4 p-3 pb-10 md:gap-6 md:p-6">
      <FinanceHeader festivalId={finance.festival.id} disabled={empty} />
      {empty ? (
        <FinanceEmptyState finance={finance} />
      ) : (
        <FestivalFinanceView finance={finance} />
      )}
    </div>
  );
}
