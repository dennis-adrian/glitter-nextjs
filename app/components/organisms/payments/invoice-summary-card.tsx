import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/components/ui/card";
import { fetchInvoice } from "@/app/data/invoices/actions";
import { getCategoryLabel } from "@/app/lib/maps/helpers";
import Image from "next/image";

type InvoiceSummaryCardProps = {
	invoiceId: number;
};
export default async function InvoiceSummaryCard(
	props: InvoiceSummaryCardProps,
) {
	const invoice = await fetchInvoice(props.invoiceId);
	if (!invoice) {
		return null;
	}
	const stand = invoice.reservation.stand;
	const categoryLabel = getCategoryLabel(stand.standCategory);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Resumen de la Reserva</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="flex gap-4 mb-4">
					<div className="w-20 h-20 rounded-md overflow-hidden flex-shrink-0">
						{stand.standCategory === "gastronomy" ? (
							<Image
								src="/img/stand-table-80x100.svg"
								alt="Mesa de stand"
								width={96}
								height={96}
								className="w-full h-full object-cover"
							/>
						) : (
							<Image
								src="/img/stand-table-half-60x120.svg"
								alt="Mesa de stand"
								width={96}
								height={96}
								className="w-full h-full object-cover"
							/>
						)}
					</div>
					<div>
						<p className="text-sm font-medium">
							Espacio {stand.label}
							{stand.standNumber}
						</p>
						<p className="text-sm text-muted-foreground">{categoryLabel}</p>
					</div>
				</div>
				<div className="flex justify-between text-sm">
					<span>Subtotal:</span>
					<span>Bs{stand.price}.00</span>
				</div>
				<div className="flex justify-between text-sm">
					<span>Descuento:</span>
					<span>-Bs0.00</span>
				</div>
				<div className="flex justify-between font-medium mt-2">
					<span>Total:</span>
					<span>Bs{invoice.amount}.00</span>
				</div>
			</CardContent>
		</Card>
	);
}
