import Loader from "@/app/components/loader";
import EditUserCategoriesPage from "@/app/components/pages/dashboard/user/edit-categories";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

const ParamsSchema = z.object({
  profileId: z.coerce.number(),
});

export default async function Page(
  props: {
    params: Promise<{ profileId: string }>;
  }
) {
  const params = await props.params;
  const validatedParams = ParamsSchema.safeParse(params);
  if (!validatedParams.success) notFound();

  return (
    <Suspense fallback={<Loader />}>
      <EditUserCategoriesPage forProfileId={validatedParams.data.profileId} />
    </Suspense>
  );
}
