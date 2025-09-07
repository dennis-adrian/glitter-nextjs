"use client";

import BaseModal from "@/app/components/modals/base-modal";
import { Button } from "@/app/components/ui/button";
import { FestivalSectorBase } from "@/app/lib/festival_sectors/definitions";
import { cn } from "@/app/lib/utils";
import Image from "next/image";
import { useState } from "react";

type DetailedMapProps = {
  festivalSectors: FestivalSectorBase[];
};

export default function DetailedMap({ festivalSectors }: DetailedMapProps) {
  const [showModal, setShowModal] = useState(false);
  const sectors = festivalSectors.sort(
    (a, b) => a.orderInFestival - b.orderInFestival,
  );

  return (
		<>
			<div className="flex justify-center mt-4">
				<Button
					variant="link"
					className="text-base md:text-lg underline"
					onClick={() => setShowModal(true)}
				>
					Ver mapa a detalle
				</Button>
			</div>
			<BaseModal
				contentClassName="p-0"
				show={showModal}
				onOpenChange={setShowModal}
				title="Mapa Detallado"
				description="Esta es una previsualización de los sectores del evento. No permite reservas ni selección de espacios."
			>
				{sectors.map((sector) => (
					<div key={sector.id}>
						<h3 className="font-semibold">Sector {sector.name}</h3>
						<div
							className={cn("relative h-96 w-full mx-auto my-4", {
								"h-64": sector.name === "Galería de arte",
							})}
						>
							<Image
								className="object-contain rounded-lg"
								alt="mapa del evento"
								src={sector.mapUrl!}
								fill
								unoptimized
							/>
						</div>
					</div>
				))}
			</BaseModal>
		</>
	);
}
