import Image from "next/image";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import FullTableGraphic from "@/app/components/festivals/reservations/full-table-graphic";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/definitions";
import { getCategoryLabel } from "@/app/lib/maps/helpers";
import { summarizeReservationStands } from "@/app/lib/reservations/member-stands";
import { FestivalBase } from "@/app/lib/festivals/definitions";

type ProductDetailsProps = {
  festival: FestivalBase;
  invoice: InvoiceWithPaymentsAndStand;
};

export function ProductDetails({ festival, invoice }: ProductDetailsProps) {
  const reservation = invoice.reservation;
  // Read the aggregate, not the parent's single stand_id: a full table is two
  // stands and used to show here as one.
  const summary = summarizeReservationStands(
    reservation.members.map((member) => ({
      id: member.standId,
      label: member.stand.label,
      standNumber: member.stand.standNumber,
      standCategory: member.stand.standCategory,
      releasedAt: member.releasedAt,
      position: member.position,
    })),
  );
  const stand = summary.primary ?? {
    label: reservation.stand.label,
    standNumber: reservation.stand.standNumber,
    standCategory: reservation.stand.standCategory,
  };
  const category = getCategoryLabel(stand.standCategory as never);
  const standCount = summary.active.length || 1;
  const isGastronomy = stand.standCategory === "gastronomy";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Detalles de la Reserva</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4">
          {!isGastronomy && (
            <div className="w-24 shrink-0">
              {summary.isFullTable ? (
                <FullTableGraphic variant="full-selected" />
              ) : (
                <Image
                  src="/img/stand-table-half-60x120.svg"
                  alt="Mesa de stand"
                  width={96}
                  height={96}
                  className="h-24 w-full object-contain"
                />
              )}
            </div>
          )}
          <div>
            <h3 className="font-semibold text-lg leading-5 mb-2">
              {standCount} {standCount === 1 ? "espacio" : "espacios"} de{" "}
              {category.toLowerCase()} -{" "}
              {summary.label || `${stand.label}${stand.standNumber}`}
            </h3>
            {summary.isFullTable && (
              <p className="mb-1 text-sm font-medium text-primary">
                Mesa completa
              </p>
            )}
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
            {isGastronomy ? (
              <li>• 2 mesas de 70cm x 70cm (total 140cm x 70cm)</li>
            ) : summary.isFullTable ? (
              <li>
                • 2 espacios de 60cm x 120cm que forman una mesa completa de
                60cm x 240cm (mesa incluida)
              </li>
            ) : (
              <li>
                • 1 espacio de 60cm x 120cm que corresponde a la mitad de una
                mesa de 60cm x 240cm (mesa incluida)
              </li>
            )}

            {/* Chairs come with each stand, so a full table has two stands'
                worth. Credentials are per reservation. */}
            <li>• {2 * standCount} sillas</li>
            <li>• 2 credenciales</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
