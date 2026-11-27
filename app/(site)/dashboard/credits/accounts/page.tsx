import { notFound } from "next/navigation";

import CreditAccountsDataTable from "@/app/components/credits/admin/credit-accounts-data-table";
import {
  CreditAccountsSearchParamsSchema,
  type RawSearchParams,
} from "@/app/lib/credits/admin-definitions";
import { fetchCreditAccounts } from "@/app/lib/credits/admin-queries";

export default async function CreditAccountsPage(props: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { filter, ...params } = CreditAccountsSearchParamsSchema.parse(
    await props.searchParams,
  );
  const page = await fetchCreditAccounts({ ...params, filters: filter });
  if (!page) notFound();

  return (
    <CreditAccountsDataTable
      rows={page.rows}
      rowCount={page.total}
      balanceTotal={page.balanceTotal}
    />
  );
}
