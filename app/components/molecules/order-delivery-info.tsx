import { TruckIcon } from "lucide-react";

import Heading from "@/app/components/atoms/heading";
import { Card, CardContent } from "@/app/components/ui/card";

interface OrderDeliveryInfoProps {
	hasAvailableItems: boolean;
	hasPresaleItems: boolean;
}

export default function OrderDeliveryInfo({
	hasAvailableItems,
	hasPresaleItems,
}: OrderDeliveryInfoProps) {
	return (
		<Card>
			<CardContent className="p-6 space-y-4">
				<Heading level={4} className="flex items-center gap-2">
					<TruckIcon className="h-4 w-4" />
					Información de entrega
				</Heading>

				{hasAvailableItems && (
					<div className={hasPresaleItems ? "pb-4 border-b" : ""}>
						<p className="text-sm font-medium mb-1">Productos disponibles</p>
						<p className="text-sm text-muted-foreground">
							Podés pasar a recoger tu pedido, o coordinamos el envío a través
							de una app de delivery (con costo adicional). Te contactaremos una
							vez que el pago sea confirmado.
						</p>
					</div>
				)}

				{hasPresaleItems && (
					<div>
						<p className="text-sm font-medium mb-1">Productos en pre-venta</p>
						<p className="text-sm text-muted-foreground">
							La entrega se realizará el día del festival en el stand de
							Productora Glitter. O durante la entrega de credenciales si tenés
							un stand reservado, siempre que el pago esté confirmado antes de
							esa fecha.
						</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
