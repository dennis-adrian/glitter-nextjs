import Loader from "@/app/components/loader";
import DashboardUserPage from "@/app/components/pages/dashboard/user/user";
import { STATUS_HISTORY_PARAM } from "@/app/components/users/status-history/status-history-list";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

const FormSchema = z.object({
  profileId: z.coerce.number(),
});
// Capped so a hand-edited URL cannot overflow the query's offset.
const HistoryPageSchema = z.coerce.number().int().min(1).max(10_000).catch(1);

export default async function Page(props: {
  params: Promise<{ profileId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ]);
  const validatedParams = FormSchema.safeParse(params);
  if (!validatedParams.success) return notFound();
  const rawHistoryPage = searchParams[STATUS_HISTORY_PARAM];
  const historyPage = HistoryPageSchema.parse(
    Array.isArray(rawHistoryPage) ? rawHistoryPage[0] : (rawHistoryPage ?? 1),
  );

  return (
    <Suspense fallback={<Loader />}>
      <DashboardUserPage
        profileId={validatedParams.data.profileId}
        historyPage={historyPage}
      />
    </Suspense>
  );
}
