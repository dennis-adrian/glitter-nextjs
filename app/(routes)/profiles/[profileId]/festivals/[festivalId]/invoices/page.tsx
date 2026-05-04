import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import Heading from "@/app/components/atoms/heading";
import InvoiceCard, {
	InvoiceWithReservation,
} from "@/app/components/payments/invoice-card";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { fetchReservationsWithInvoicesByProfileAndFestival } from "@/app/data/invoices/actions";
import { InvoiceWithPayments } from "@/app/data/invoices/definitions";
import { fetchBaseFestival } from "@/app/lib/festivals/actions";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";

const ParamsSchema = z.object({
	profileId: z.coerce.number(),
	festivalId: z.coerce.number(),
});

const STATUS_PRIORITY: Record<InvoiceWithPayments["status"], number> = {
	pending: 0,
	paid: 1,
	cancelled: 2,
};

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

	const reservations = await fetchReservationsWithInvoicesByProfileAndFestival(
		validatedParams.data.profileId,
		validatedParams.data.festivalId,
	);

	const invoices: InvoiceWithReservation[] = reservations
		.filter((r) => r.status !== "rejected")
		.flatMap((reservation) =>
			reservation.invoices.map((invoice) => ({ ...invoice, reservation })),
		)
		.sort((a, b) => {
			const statusDiff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
			if (statusDiff !== 0) return statusDiff;
			return b.date.getTime() - a.date.getTime();
		});

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

			{invoices.length === 0 ? (
				<Card>
					<CardContent className="p-6 text-center">
						<p className="text-sm text-muted-foreground">
							No tienes facturas en este festival.
						</p>
					</CardContent>
				</Card>
			) : (
				<div className="flex flex-col gap-3">
					{invoices.map((invoice) => (
						<InvoiceCard
							key={invoice.id}
							invoice={invoice}
							profileId={validatedParams.data.profileId}
							festivalId={validatedParams.data.festivalId}
						/>
					))}
				</div>
			)}
		</div>
	);
}
