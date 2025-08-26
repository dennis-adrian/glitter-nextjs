import Image from "next/image";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/definitions";
import { getCategoryLabel } from "@/app/lib/maps/helpers";
import { FestivalBase } from "@/app/lib/festivals/definitions";

type ProductDetailsProps = {
  festival: FestivalBase;
  invoice: InvoiceWithPaymentsAndStand;
};

export function ProductDetails({ festival, invoice }: ProductDetailsProps) {
  const stand = invoice.reservation.stand;
  const category = getCategoryLabel(stand.standCategory);

  return (
		<Card>
			<CardHeader>
				<CardTitle>Detalles de la Reserva</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="flex gap-4">
					<div className="w-24 h-24 rounded-md overflow-hidden shrink-0">
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
						<h3 className="font-semibold text-lg leading-5 mb-2">
							1 espacio de {category.toLowerCase()} - {stand.label}
							{stand.standNumber}
						</h3>
						<p className="text-muted-foreground text-sm mb-1">
							{festival.name}
						</p>
						<span className="font-medium">Bs{invoice.amount}</span>
					</div>
				</div>

				<div className="mt-4">
					<h4 className="font-medium mb-2">Lo que incluye:</h4>
					<ul className="text-sm space-y-1">
						<li>• Participación en el festival {festival.name}</li>
						{stand.standCategory === "gastronomy" ? (
							<li>• 1 mesa de 80cm x 100cm</li>
						) : (
							<li>
								• 1 espacio de 60cm x 120cm que corresponde a la mitad de una
								mesa de 60cm x 240cm (mesa incluida)
							</li>
						)}

						<li>• 2 sillas</li>
						<li>• 2 credenciales</li>
					</ul>
				</div>
			</CardContent>
		</Card>
	);
}
