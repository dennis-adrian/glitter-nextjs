import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import Heading from "@/app/components/atoms/heading";
import FestivalInvoicesList from "@/app/components/payments/festival-invoices-list";
import PageBreadcrumbs from "@/app/components/navbar/page-breadcrumbs";
import { ScreenTitle } from "@/app/components/navbar/screen-bar";
import FestivalInvoicesListSkeleton from "@/app/components/payments/festival-invoices-list-skeleton";
import { fetchBaseFestival } from "@/app/lib/festivals/actions";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";

const ParamsSchema = z.object({
  profileId: z.coerce.number(),
  festivalId: z.coerce.number(),
});

export default async function Page(props: {
  params: Promise<{ profileId: string; festivalId: string }>;
}) {
  const params = await props.params;
  const validatedParams = ParamsSchema.safeParse(params);
  if (!validatedParams.success) redirect("/");

  const profile = await getCurrentUserProfile();
  if (!profile) notFound();
  await protectRoute(profile || undefined, validatedParams.data.profileId);

  const festival = await fetchBaseFestival(validatedParams.data.festivalId);
  if (!festival) notFound();

  return (
    <div className="container max-w-3xl p-4 md:p-6">
      <ScreenTitle title={festival.name} />
      <PageBreadcrumbs className="mb-2" />

      <Heading level={2} data-installed-title="">
        {festival.name}
      </Heading>
      <p className="text-sm md:text-base text-muted-foreground mb-6">
        Tus pagos para este festival
      </p>

      <Suspense fallback={<FestivalInvoicesListSkeleton />}>
        <FestivalInvoicesList
          profileId={validatedParams.data.profileId}
          festivalId={validatedParams.data.festivalId}
        />
      </Suspense>
    </div>
  );
}
