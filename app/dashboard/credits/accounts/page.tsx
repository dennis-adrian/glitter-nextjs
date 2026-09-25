import { Suspense } from "react";

import CreditAccountPicker from "@/app/components/credits/admin/credit-account-picker";
import CreditAccountsFilters from "@/app/components/credits/admin/credit-accounts-filters";
import CreditAccountsTable from "@/app/components/credits/admin/credit-accounts-table";
import TableSkeleton from "@/app/components/users/skeletons/table";
import {
  CreditAccountsSearchParamsSchema,
  type RawSearchParams,
} from "@/app/lib/credits/admin-definitions";

export default async function CreditAccountsPage(props: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = CreditAccountsSearchParamsSchema.parse(
    await props.searchParams,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Cada persona que alguna vez compró, recibió o usó créditos. El saldo
          es el del libro; el disponible descuenta lo retenido por funciones
          activadas.
        </p>
        <CreditAccountPicker />
      </div>
      <CreditAccountsFilters />
      <Suspense key={JSON.stringify(params)} fallback={<TableSkeleton />}>
        <CreditAccountsTable params={params} />
      </Suspense>
    </div>
  );
}
