"use client";

import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";

export default function BestStandDisclaimer() {
	return (
		<Alert variant="default">
			<AlertTitle>Importante</AlertTitle>
			<AlertDescription>
				Un mismo participante no puede ganar en dos ediciones consecutivas de la
				actividad. Si saliste ganador en el último festival Glitter, podés subir
				la imagen de tu stand pero en caso de recibir la mayor cantidad de
				votos, el premio pasa al siguiente en la votación.
			</AlertDescription>
		</Alert>
	);
}
