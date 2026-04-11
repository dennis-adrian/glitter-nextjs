"use client";

import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";
import { PartyPopperIcon } from "lucide-react";

export default function FestivalHappeningNotice() {
	return (
		<div className="container px-3 py-10">
			<Alert>
				<PartyPopperIcon className="h-4 w-4" />
				<AlertTitle>¡Estamos en el festival!</AlertTitle>
				<AlertDescription>
					<p>
						La tiendita en línea está en pausa mientras el festival está en
						curso. Pasa por nuestro stand y compra tu merch directamente con
						nosotros.
					</p>
					<p className="mt-2">
						¡Vuelve después del festival para seguir comprando en línea!
					</p>
				</AlertDescription>
			</Alert>
		</div>
	);
}
