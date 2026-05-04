import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import Heading from "@/app/components/atoms/heading";
import FestivalInvoicesList from "@/app/components/payments/festival-invoices-list";
import FestivalInvoicesListSkeleton from "@/app/components/payments/festival-invoices-list-skeleton";
import { Button } from "@/app/components/ui/button";
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
	const festival = await fetchBaseFestival(validatedParams.data.festivalId);
	if (!festival || !profile) notFound();
	await protectRoute(profile, validatedParams.data.profileId);

	return (
		<div className="container max-w-3xl p-4 md:p-6">
			<Button asChild variant="link" size="sm" className="px-0 mb-2">
				<Link href="/portal">
					<ArrowLeftIcon className="w-3.5 h-3.5 mr-1" />
					Volver al portal
				</Link>
			</Button>

			<Heading level={2}>{festival.name}</Heading>
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
