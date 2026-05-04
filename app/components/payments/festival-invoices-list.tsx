import { Card, CardContent } from "@/app/components/ui/card";
import InvoiceCard, {
	InvoiceWithReservation,
} from "@/app/components/payments/invoice-card";
import { fetchReservationsWithInvoicesByProfileAndFestival } from "@/app/data/invoices/actions";
import { InvoiceWithPayments } from "@/app/data/invoices/definitions";

const STATUS_PRIORITY: Record<InvoiceWithPayments["status"], number> = {
	pending: 0,
	paid: 1,
	cancelled: 2,
};

type Props = {
	profileId: number;
	festivalId: number;
};

export default async function FestivalInvoicesList({
	profileId,
	festivalId,
}: Props) {
	const reservations = await fetchReservationsWithInvoicesByProfileAndFestival(
		profileId,
		festivalId,
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

	if (invoices.length === 0) {
		return (
			<Card>
				<CardContent className="p-6 text-center">
					<p className="text-sm text-muted-foreground">
						No tienes facturas en este festival.
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			{invoices.map((invoice) => (
				<InvoiceCard
					key={invoice.id}
					invoice={invoice}
					profileId={profileId}
					festivalId={festivalId}
				/>
			))}
		</div>
	);
}
