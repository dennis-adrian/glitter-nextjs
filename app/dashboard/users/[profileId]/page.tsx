import Loader from "@/app/components/loader";
import DashboardUserPage from "@/app/components/pages/dashboard/user/user";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

const FormSchema = z.object({
  profileId: z.coerce.number(),
});
export default async function Page(
  props: {
    params: Promise<{ profileId: string }>;
  }
) {
  const params = await props.params;
  const validatedParams = FormSchema.safeParse(params);
  if (!validatedParams.success) return notFound();

  return (
    <Suspense fallback={<Loader />}>
      <DashboardUserPage profileId={validatedParams.data.profileId} />
    </Suspense>
  );
}
