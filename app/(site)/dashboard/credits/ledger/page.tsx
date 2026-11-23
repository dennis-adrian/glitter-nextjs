import { notFound } from "next/navigation";

import CreditLedgerDataTable from "@/app/components/credits/admin/credit-ledger-data-table";
import {
  CreditLedgerSearchParamsSchema,
  type RawSearchParams,
} from "@/app/lib/credits/admin-definitions";
import {
  fetchCreditLedger,
  fetchCreditLedgerFestivals,
} from "@/app/lib/credits/admin-queries";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function CreditLedgerPage(props: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = CreditLedgerSearchParamsSchema.parse(await props.searchParams);
  const [actor, page, festivals] = await Promise.all([
    getCurrentUserProfile(),
    fetchCreditLedger({ ...params, kinds: params.kind }),
    fetchCreditLedgerFestivals(),
  ]);
  if (!page) notFound();

  return (
    <CreditLedgerDataTable
      rows={page.rows}
      rowCount={page.total}
      totals={{ creditsIn: page.creditsIn, creditsOut: page.creditsOut }}
      festivals={festivals}
      canAdjust={canMutateAdminReservations(actor)}
    />
  );
}
