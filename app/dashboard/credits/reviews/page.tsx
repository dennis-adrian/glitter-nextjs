import { notFound } from "next/navigation";

import CreditPurchaseStatusTabs from "@/app/components/credits/admin/credit-purchase-status-tabs";
import CreditPurchasesDataTable from "@/app/components/credits/admin/credit-purchases-data-table";
import {
  CreditPurchasesSearchParamsSchema,
  type RawSearchParams,
} from "@/app/lib/credits/admin-definitions";
import {
  fetchCreditLedgerFestivals,
  fetchCreditPurchases,
} from "@/app/lib/credits/admin-queries";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

/**
 * Every credit purchase, with the vouchers waiting for a decision first.
 *
 * Approving a voucher confirms credits already issued. Rejecting reverses
 * them, but never undoes something the participant already did with them.
 */
export default async function CreditReviewsPage(props: {
  searchParams: Promise<RawSearchParams>;
}) {
  const searchParams = await props.searchParams;
  const params = CreditPurchasesSearchParamsSchema.parse(searchParams);
  const now = new Date();
  const [actor, page, festivals] = await Promise.all([
    getCurrentUserProfile(),
    fetchCreditPurchases(params, now),
    fetchCreditLedgerFestivals(),
  ]);
  if (!page) notFound();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <CreditPurchaseStatusTabs
        status={params.status}
        counts={page.counts}
        searchParams={searchParams}
      />
      <CreditPurchasesDataTable
        rows={page.rows}
        rowCount={page.total}
        totalAmount={page.totalAmount}
        status={params.status}
        festivals={festivals}
        canReview={canMutateAdminReservations(actor)}
        now={now}
      />
    </div>
  );
}
