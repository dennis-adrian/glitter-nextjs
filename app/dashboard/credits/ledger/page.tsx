import { Suspense } from "react";

import CreditLedgerFilters from "@/app/components/credits/admin/credit-ledger-filters";
import CreditLedgerTable from "@/app/components/credits/admin/credit-ledger-table";
import TableSkeleton from "@/app/components/users/skeletons/table";
import {
  CreditLedgerSearchParamsSchema,
  type RawSearchParams,
} from "@/app/lib/credits/admin-definitions";
import { fetchCreditLedgerFestivals } from "@/app/lib/credits/admin-queries";

export default async function CreditLedgerPage(props: {
  searchParams: Promise<RawSearchParams>;
}) {
  const [params, festivals] = await Promise.all([
    props.searchParams.then((raw) => CreditLedgerSearchParamsSchema.parse(raw)),
    fetchCreditLedgerFestivals(),
  ]);

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        El libro completo de créditos, de todos los participantes. Nada se
        borra: una corrección es un movimiento nuevo que queda al lado del
        original.
      </p>
      <CreditLedgerFilters festivals={festivals} />
      <Suspense key={JSON.stringify(params)} fallback={<TableSkeleton />}>
        <CreditLedgerTable params={params} />
      </Suspense>
    </div>
  );
}
