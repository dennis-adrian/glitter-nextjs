"use client";

import { Minus, Plus, Minimize2 } from "lucide-react";
import { useControls } from "react-zoom-pan-pinch";
import { Button } from "@/app/components/ui/button";

export default function MapToolbar() {
	const { zoomIn, zoomOut, resetTransform } = useControls();

	return (
		<div className="flex items-center gap-1">
			<Button
				variant="outline"
				size="icon"
				className="h-8 w-8"
				onClick={() => zoomIn()}
				aria-label="Acercar"
			>
				<Plus className="h-4 w-4" />
			</Button>
			<Button
				variant="outline"
				size="icon"
				className="h-8 w-8"
				onClick={() => zoomOut()}
				aria-label="Alejar"
			>
				<Minus className="h-4 w-4" />
			</Button>
			<Button
				variant="outline"
				size="icon"
				className="h-8 w-8"
				onClick={() => resetTransform()}
				aria-label="Restablecer zoom"
			>
				<Minimize2 className="h-4 w-4" />
			</Button>
		</div>
	);
}
