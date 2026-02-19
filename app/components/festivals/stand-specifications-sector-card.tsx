import { UserCategory } from "@/app/api/users/definitions";
import { Badge } from "@/app/components/ui/badge";
import { Card, CardContent } from "@/app/components/ui/card";
import { FestivalSectorWithStands } from "@/app/lib/festival_sectors/definitions";

export default function StandSpecificationsSectorCard({
	sector,
	category,
}: {
	sector: FestivalSectorWithStands & {
		allowedCategories: UserCategory[];
	};
	category: UserCategory;
}) {
	const sectorPrice =
		sector.stands.find((stand) => stand.standCategory === category)?.price ?? 0;

	let sectorSpecifications = "";
	if (category === "gastronomy") {
		sectorSpecifications =
			"80cm x 100cm (mesa completa). Área final. No puede compartir espacio.";
	} else {
		sectorSpecifications = "60cm x 120cm (media mesa).";
		if (category === "illustration") {
			sectorSpecifications += " Puede compartir espacio con otro ilustrador";
		} else {
			sectorSpecifications += " No puede compartir espacio con otro expositor";
		}
	}

	const servicesIncluded: string[] = [];
	// Adding services based on the sector
	if (
		sector.name.toLowerCase().includes("galer") ||
		sector.name.toLowerCase().includes("teatro") ||
		sector.name.toLowerCase().includes("lobby")
	) {
		servicesIncluded.push("Puntos de conexión a electricidad");
		servicesIncluded.push("Ambiente cerrado con aire acondicionado");
	}
	if (sector.name.toLowerCase().includes("apple")) {
		servicesIncluded.push("Ambiente abierto, techado");
	}
	if (sector.name.toLowerCase().includes("balliv")) {
		servicesIncluded.push("Puntos de conexión a electricidad");
		servicesIncluded.push("Ambiente semi-abierto, techado");
	}

	// Adding services based on the category
	if (category === "illustration") {
		servicesIncluded.push(
			"1 pin de regalo por participante (acompañantes no incluidos)",
		);
		servicesIncluded.push("1 credencial por participante");
		servicesIncluded.push(
			"1 credencial para acompañante en caso de no compartir espacio con otro ilustrador",
		);
	} else {
		servicesIncluded.push("1 pin de regalo");
		servicesIncluded.push("1 credencial para expositor");
		servicesIncluded.push("1 credencial para acompañante");
	}
	// All categories have these services
	servicesIncluded.push("2 sillas");
	servicesIncluded.push("Mesa incluida");

	return (
		<Card className="overflow-hidden">
			<CardContent className="p-0">
				<div className="bg-primary p-3">
					<h3 className="font-semibold text-primary-foreground">
						{sector.name}
					</h3>
				</div>
				<div className="p-4 space-y-3">
					<div className="flex justify-between items-start gap-3">
						<div>
							<span className="font-medium">Especificaciones:</span>
							<p className="text-muted-foreground">{sectorSpecifications}</p>
						</div>
						<Badge variant="outline" className="text-lg font-semibold">
							Bs{sectorPrice.toLocaleString()}
						</Badge>
					</div>

					<div>
						<span className="font-medium">Servicios Incluidos:</span>
						<ul className="text-muted-foreground list-disc pl-5 mt-1">
							{servicesIncluded.map((service, index) => (
								<li key={index}>{service}</li>
							))}
						</ul>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
