import Loader from "@/app/components/loader";
import DashboardUserPage from "@/app/components/pages/dashboard/user/user";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

const FormSchema = z.object({
  profileId: z.coerce.number(),
});
const HistoryPageSchema = z.coerce.number().int().min(1).catch(1);

export default async function Page(props: {
  params: Promise<{ profileId: string }>;
  searchParams: Promise<{ historial?: string | string[] }>;
}) {
  const [params, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ]);
  const validatedParams = FormSchema.safeParse(params);
  if (!validatedParams.success) return notFound();
  const historyPage = HistoryPageSchema.parse(
    Array.isArray(searchParams.historial)
      ? searchParams.historial[0]
      : (searchParams.historial ?? 1),
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
