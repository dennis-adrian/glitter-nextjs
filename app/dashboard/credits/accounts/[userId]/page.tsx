import { notFound } from "next/navigation";
import { z } from "zod";

import CreditAccountDetail, {
  CREDIT_ACCOUNT_TABS,
} from "@/app/components/credits/admin/credit-account-detail";
import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";

const ParamsSchema = z.object({
  userId: z.coerce.number().int().positive(),
});
const TabSchema = z.enum(CREDIT_ACCOUNT_TABS).catch("movements");

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

  return (
    <CreditAccountDetail
      userId={parsed.data.userId}
      tab={TabSchema.parse(searchParams.tab)}
      searchParams={searchParams}
    />
  );
}
