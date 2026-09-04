"use client";

import { UserCategory } from "@/app/api/users/definitions";
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
  // only inventory that sells a shared price, and it is the total for the whole
  // reservation — owner plus partner — not a price per person.
  //
  // A `new_artist` profile takes illustration inventory, so every category
  // branch below reads the mapped category: a sector stocks illustration
  // stands, never `new_artist` ones, and the raw category finds nothing to
  // price. `new_artist` may also take a partner (see
  // `evaluatePartnerSearchDenial`), so it has to be quoted the shared rate and
  // told the space is shareable — the raw category sold it neither.
  const pricedStand = sector.stands.find(
    (stand) => stand.standCategory === effectiveCategory,
  );
  const individualPrice = pricedStand?.individualPrice ?? 0;
  const sharedPrice =
    effectiveCategory === "illustration"
      ? (pricedStand?.sharedPrice ?? null)
      : null;

  const standCount = sector.stands.filter(
    (stand) => stand.standCategory === effectiveCategory,
  ).length;

  let sectorSpecifications = "";
  if (effectiveCategory === "gastronomy") {
    sectorSpecifications =
      "140cm x 70cm (2 mesas de 70cm x 70cm). Área final. No puede compartir espacio.";
  } else if (
    effectiveCategory === "entrepreneurship" &&
    sector.name.toLowerCase().includes("balliv")
  ) {
    sectorSpecifications =
      "140cm x 70cm (dos mesas de 70cm x 70cm). Sector habilitado para emprendimientos cuyo negocio interactúa con el público con actividades.";
  } else {
    sectorSpecifications = "60cm x 120cm (media mesa).";
    if (effectiveCategory === "illustration") {
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
  if (effectiveCategory === "illustration") {
    servicesIncluded.push(
      "1 pin de regalo por participante (acompañantes no incluidos)",
    );
    servicesIncluded.push("1 credencial por participante");
    servicesIncluded.push(
      "1 credencial para acompañante en caso de no compartir espacio con otro ilustrador",
    );
  } else if (effectiveCategory === "gastronomy") {
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
    `${effectiveCategory === "gastronomy" ? "Mesas incluidas" : "Mesa incluida"}`,
  );

  return (
    <>
      {/* The grid stretches every card to the tallest in its row, so the
          column has to fill that height and the price section has to sit at the
          bottom of it. Otherwise a short card leaves its spare height below the
          tinted footer, where it reads as the card carrying on past its own
          content. */}
      <Card className="flex h-full flex-col overflow-hidden">
        <CardContent className="flex flex-1 flex-col p-0">
          {/* Title and count read as one line; the band carries no price so
              the card has exactly one place to look for money. */}
          <div className="bg-primary p-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="font-semibold text-lg text-primary-foreground">
              {sector.name}
              {effectiveCategory === "entrepreneurship" &&
                sector.name.toLowerCase().includes("balliv") &&
                " (Activaciones)"}
            </h3>
            <p className="text-xs text-primary-foreground/80">
              {standCount} {standCount === 1 ? "espacio" : "espacios"}
            </p>
          </div>
          <div className="p-4 space-y-3 text-sm">
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
          </div>

          {/* Its own section, closing the card: what the space is, then what it
              costs. Each rate is a row naming what it buys, with the amount
              right-aligned against it — the shared price used to sit inside a
              sentence, where it read as prose rather than as the second of two
              options. */}
          <div className="mt-auto border-t bg-muted/40 px-4 py-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {sharedPrice != null ? "Precios" : "Precio"}
            </h4>
            {sharedPrice == null ? (
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  Por espacio
                </span>
                <span className="shrink-0 whitespace-nowrap text-lg font-semibold tabular-nums">
                  Bs. {individualPrice.toLocaleString()}
                </span>
              </div>
            ) : (
              <dl className="mt-1 divide-y text-sm">
                <div className="flex items-baseline justify-between gap-3 py-2">
                  <dt>
                    <span className="font-medium">Espacio individual</span>
                    <span className="block text-xs text-muted-foreground">
                      Para vos solo
                    </span>
                  </dt>
                  <dd className="shrink-0 text-lg whitespace-nowrap font-semibold tabular-nums">
                    Bs. {individualPrice.toLocaleString()}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 py-2">
                  <dt>
                    <span className="font-medium">Espacio compartido</span>
                    <span className="block text-xs text-muted-foreground">
                      Para compartirlo con otro ilustrador
                    </span>
                  </dt>
                  <dd className="shrink-0 whitespace-nowrap font-semibold tabular-nums">
                    Bs. {sharedPrice.toLocaleString()}
                  </dd>
                </div>
              </dl>
            )}

            {hasMap && (
              // The rule goes on the wrapper: the button is a pill, so a border
              // on it curves with the radius instead of dividing the section.
              <div className="mt-3 border-t pt-2">
                <Button
                  variant="link"
                  size="sm"
                  className="w-full"
                  onClick={() => setMapOpen(true)}
                >
                  <MapIcon className="w-4 h-4 mr-2" />
                  Ver mapa del sector
                </Button>
              </div>
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
