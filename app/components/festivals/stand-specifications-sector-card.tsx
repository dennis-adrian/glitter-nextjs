"use client";

import { UserCategory } from "@/app/api/users/definitions";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import MapCanvas from "@/app/components/maps/map-canvas";
import MapElement from "@/app/components/maps/map-element";
import MapStand from "@/app/components/maps/map-stand";
import { computeCanvasBounds } from "@/app/components/maps/map-utils";
import type { StandColors } from "@/app/components/maps/map-utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FestivalSectorWithStands,
  FestivalSectorWithStandsWithReservationsWithParticipants,
} from "@/app/lib/festival_sectors/definitions";
import { MapIcon } from "lucide-react";
import { useState } from "react";

const MY_CATEGORY_COLORS: StandColors = {
  fill: "rgba(221,214,254,0.6)",
  hoverFill: "rgba(221,214,254,0.6)",
  stroke: "rgba(139,92,246,0.8)",
  text: "hsl(262,77%,49%)",
};

const OTHER_COLORS: StandColors = {
  fill: "rgba(229,231,235,0.35)",
  hoverFill: "rgba(229,231,235,0.35)",
  stroke: "rgba(209,213,219,0.4)",
  text: "#9CA3AF",
};

export default function StandSpecificationsSectorCard({
  sector,
  category,
  fullSector,
}: {
  sector: FestivalSectorWithStands & {
    allowedCategories: UserCategory[];
  };
  category: UserCategory;
  fullSector?: FestivalSectorWithStandsWithReservationsWithParticipants;
}) {
  const [mapOpen, setMapOpen] = useState(false);

  const effectiveCategory =
    category === "new_artist" ? "illustration" : category;
  const isMyCategory = (standCategory: string) =>
    standCategory === effectiveCategory ||
    (effectiveCategory === "illustration" && standCategory === "new_artist");

  const hasMap =
    fullSector?.stands.some(
      (s) =>
        s.positionLeft != null &&
        s.positionTop != null &&
        isMyCategory(s.standCategory),
    ) ?? false;

  // `stands.price` is the legacy mirror of the individual price and is on its
  // way out; both real prices live in their own columns. Illustration is the
  // only category that sells a shared price, and it is the total for the whole
  // reservation — owner plus partner — not a price per person.
  const pricedStand = sector.stands.find(
    (stand) => stand.standCategory === category,
  );
  const individualPrice = pricedStand?.individualPrice ?? 0;
  const sharedPrice =
    category === "illustration" ? (pricedStand?.sharedPrice ?? null) : null;

  let sectorSpecifications = "";
  if (category === "gastronomy") {
    sectorSpecifications =
      "140cm x 70cm (2 mesas de 70cm x 70cm). Área final. No puede compartir espacio.";
  } else if (
    category === "entrepreneurship" &&
    sector.name.toLowerCase().includes("balliv")
  ) {
    sectorSpecifications =
      "140cm x 70cm (dos mesas de 70cm x 70cm). Sector habilitado para emprendimientos cuyo negocio interactúa con el público con actividades.";
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
    servicesIncluded.push("Puntos de corriente según ubicación del stand**");
    servicesIncluded.push("Ambiente cerrado con aire acondicionado");
  }
  if (sector.name.toLowerCase().includes("apple")) {
    servicesIncluded.push("Ambiente abierto, techado");
  }
  if (sector.name.toLowerCase().includes("balliv")) {
    servicesIncluded.push("Puntos de corriente según ubicación del stand**");
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
  } else if (category === "gastronomy") {
    servicesIncluded.push("1 pin de regalo");
    servicesIncluded.push("2 credenciales con el nombre del expositor");
  } else {
    servicesIncluded.push("1 pin de regalo");
    servicesIncluded.push("1 credencial para expositor");
    servicesIncluded.push("1 credencial para acompañante");
  }
  // All categories have these services
  servicesIncluded.push("2 sillas");
  servicesIncluded.push(
    `${category === "gastronomy" ? "Mesas incluidas" : "Mesa incluida"}`,
  );

  return (
    <>
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="bg-primary p-3 flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-primary-foreground">
                {sector.name}
                {category === "entrepreneurship" &&
                  sector.name.toLowerCase().includes("balliv") &&
                  " (Activaciones)"}
              </h3>
              <p className="text-xs text-primary-foreground">
                {
                  sector.stands.filter((s) => s.standCategory === category)
                    .length
                }{" "}
                espacios
              </p>
            </div>
            {/* One number in the band, so the sectors stay comparable while
                scrolling. When there are two ways to take the space, it becomes
                the entry price and both rates are named in full below —
                booking apps price a room the same way. */}
            <Badge className="shrink-0 text-lg font-semibold text-primary-foreground">
              {sharedPrice != null && (
                <span className="mr-1.5 text-[11px] font-normal uppercase tracking-wide opacity-80">
                  Desde
                </span>
              )}
              <span>Bs.</span> {individualPrice.toLocaleString()}
            </Badge>
          </div>
          <div className="p-4 space-y-3 text-sm">
            {/* A rate per row, each with the name of what it buys and the price
                right-aligned against it. The shared price used to sit in a
                sentence halfway down the card, where it read as prose rather
                than as the second of two options. */}
            {sharedPrice != null && (
              <dl className="divide-y rounded-lg border">
                <div className="flex items-baseline justify-between gap-3 px-3 py-2">
                  <dt>
                    <span className="font-medium">Espacio individual</span>
                    <span className="block text-xs text-muted-foreground">
                      Para vos solo
                    </span>
                  </dt>
                  <dd className="shrink-0 whitespace-nowrap font-semibold tabular-nums">
                    Bs. {individualPrice.toLocaleString()}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 px-3 py-2">
                  <dt>
                    <span className="font-medium">Espacio compartido</span>
                    <span className="block text-xs text-muted-foreground">
                      Total de la reserva, no por persona, y lo paga quien
                      reserva
                    </span>
                  </dt>
                  <dd className="shrink-0 whitespace-nowrap font-semibold tabular-nums">
                    Bs. {sharedPrice.toLocaleString()}
                  </dd>
                </div>
              </dl>
            )}

            <div>
              <span className="font-medium">Especificaciones:</span>
              <p className="text-muted-foreground">{sectorSpecifications}</p>
            </div>

            <div>
              <span className="font-medium">Servicios Incluidos:</span>
              <ul className="text-muted-foreground list-disc pl-5 mt-1">
                {servicesIncluded.map((service, index) => (
                  <li key={index}>{service}</li>
                ))}
              </ul>
            </div>

            {hasMap && (
              <Button
                variant="link"
                size="sm"
                className="w-full mt-1"
                onClick={() => setMapOpen(true)}
              >
                <MapIcon className="w-4 h-4 mr-2" />
                Ver mapa del sector
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {hasMap && fullSector && (
        <Dialog open={mapOpen} onOpenChange={setMapOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{sector.name}</DialogTitle>
              <DialogDescription>
                Esta imagen es solo una representación visual del sector. No
                permite la reserva de espacios en este momento.
              </DialogDescription>
            </DialogHeader>

            {/* Legend */}
            <div className="flex gap-4 flex-wrap mt-2">
              <div className="flex items-center gap-1.5 text-sm">
                <span
                  className="inline-block w-4 h-4 rounded-sm border"
                  style={{
                    backgroundColor: MY_CATEGORY_COLORS.fill,
                    borderColor: MY_CATEGORY_COLORS.stroke,
                  }}
                />
                <span>Tu categoría</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span
                  className="inline-block w-4 h-4 rounded-sm border"
                  style={{
                    backgroundColor: OTHER_COLORS.fill,
                    borderColor: OTHER_COLORS.stroke,
                  }}
                />
                <span>Otras categorías</span>
              </div>
            </div>

            {/* Map */}
            <MapCanvas
              config={computeCanvasBounds(
                fullSector.stands,
                fullSector.mapElements,
              )}
              className="w-full h-auto border rounded-md"
            >
              {fullSector.mapElements.map((el) => (
                <MapElement key={el.id} element={el} />
              ))}
              {fullSector.stands
                .filter((s) => s.positionLeft != null && s.positionTop != null)
                .map((stand) => (
                  <MapStand
                    key={stand.id}
                    stand={stand}
                    canBeReserved={false}
                    colors={
                      isMyCategory(stand.standCategory)
                        ? MY_CATEGORY_COLORS
                        : OTHER_COLORS
                    }
                  />
                ))}
            </MapCanvas>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
