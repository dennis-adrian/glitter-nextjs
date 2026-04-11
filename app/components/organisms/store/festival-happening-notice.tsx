"use client";

import Link from "next/link";
import { PartyPopperIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";
import { Button } from "@/app/components/ui/button";

type Props = {
	festival: { id: number; name: string } | null;
};

export default function FestivalHappeningNotice({ festival }: Props) {
	return (
		<div className="container px-3 py-10">
			<Alert>
				<PartyPopperIcon className="h-4 w-4" />
				<AlertTitle>
					{festival
						? `¡Estamos en ${festival.name}!`
						: "¡Estamos en el festival!"}
				</AlertTitle>
				<AlertDescription>
					<p>
						La tiendita en línea está en pausa mientras el festival está en
						curso. Pasa por nuestro stand y compra tu merch directamente con
						nosotros.
					</p>
					<p className="mt-2">
						¡Vuelve después del festival para seguir comprando en línea!
					</p>
					{festival && (
						<Button asChild className="mt-4">
							<Link href={`/festivals/${festival.id}`}>Ver el festival</Link>
						</Button>
					)}
				</AlertDescription>
			</Alert>
		</div>
	);
}
