import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import CreditAccountDetail from "@/app/components/credits/admin/credit-account-detail";
import Loader from "@/app/components/loader";
import {
  CreditLedgerSearchParamsSchema,
  type RawSearchParams,
} from "@/app/lib/credits/admin-definitions";

const ParamsSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

export default async function CreditAccountPage(props: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [params, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ]);
  const parsed = ParamsSchema.safeParse(params);
  if (!parsed.success) notFound();

  // The person comes from the route; a `query` or `userId` in the URL must not
  // widen the history to somebody else's.
  const ledgerParams = {
    ...CreditLedgerSearchParamsSchema.parse(searchParams),
    query: "",
    userId: parsed.data.userId,
  };

  return (
    <Suspense fallback={<Loader />}>
      <CreditAccountDetail
        userId={parsed.data.userId}
        ledgerParams={ledgerParams}
      />
    </Suspense>
  );
}
