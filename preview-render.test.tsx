/** Throwaway: renders the reservation detail states to a static HTML file. */
import { writeFileSync } from "node:fs";
import { ArrowRightIcon } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { it } from "vitest";

import Title from "@/app/components/atoms/heading";
import ReservationAvailableActions from "@/app/components/festivals/reservations/reservation-available-actions";
import ReservationSpaceSummary from "@/app/components/festivals/reservations/reservation-space-summary";
import ReservationStatusPanel from "@/app/components/festivals/reservations/reservation-status-panel";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { participantStatusCopy } from "@/app/lib/reservations/participant-status";

import type { ReservationAction } from "@/app/components/festivals/reservations/reservation-available-actions";

const ACTIONS: ReservationAction[] = [
  {
    id: "late-partner",
    control: (
      <Button variant="outline" className="w-full sm:w-auto">
        Agregar compañero
      </Button>
    ),
  },
  {
    id: "release",
    control: (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Liberar tu reserva cuesta 20 créditos. Te faltan 20 créditos.
        </p>
        <Button className="w-full sm:w-auto">Comprar 20 créditos</Button>
      </div>
    ),
  },
];

function DetailCard({
  status,
  isFullTable = false,
  isOwner = true,
  actions = [],
}: {
  status: string;
  isFullTable?: boolean;
  isOwner?: boolean;
  actions?: ReservationAction[];
}) {
  const copy = participantStatusCopy(status)!;
  const owesPayment = status === "pending" || status === "verification_payment";
  const showsTotalWithPayment = owesPayment && isOwner;

  return (
    <div className="container max-w-[640px] space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <Title>Tu reserva</Title>
        <p className="text-sm text-muted-foreground">Glitter ¡Feliz Cumple!</p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5 md:p-6">
          <ReservationStatusPanel
            copy={copy}
            deadlineLabel={owesPayment ? "10/09/2026 02:21" : null}
          />
          {showsTotalWithPayment && (
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Total
                </p>
                <p className="font-space-grotesk text-2xl font-bold leading-none">
                  Bs370
                </p>
              </div>
              <Button size="lg" className="w-full sm:w-auto">
                {status === "verification_payment"
                  ? "Ver estado del pago"
                  : "Completar el pago"}
                <ArrowRightIcon className="ml-2 h-4 w-4 shrink-0" />
              </Button>
            </div>
          )}
          {owesPayment && !isOwner && (
            <p className="border-t pt-4 text-sm text-muted-foreground">
              El pago corre por cuenta de Ilustración Demo.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 md:p-6">
          <ReservationSpaceSummary
            isFullTable={isFullTable}
            standLabel={isFullTable ? "B28 y B29" : "B28"}
            dimensions={isFullTable ? "60cm x 240cm" : "60cm x 120cm"}
            sectorName="Teatro"
            rows={[
              {
                label: isOwner ? "A nombre de" : "Participantes",
                value: isOwner
                  ? "Ilustración Demo"
                  : "Ilustración Demo y Carla Dibuja",
              },
              ...(showsTotalWithPayment
                ? []
                : [{ label: "Precio", value: "Bs370" }]),
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 md:p-6">
          <ReservationAvailableActions
            canAct={isOwner}
            actions={actions}
            deadlineNote={
              actions.length > 0
                ? "Si olvidaste agregar a tu compañero, podés hacerlo hasta el 19/09/2026 usando créditos."
                : undefined
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

const STATES: Array<[string, React.ReactElement]> = [
  ["Pendiente de pago (titular)", <DetailCard status="pending" actions={ACTIONS} key="a" />],
  ["Mesa completa confirmada", <DetailCard status="accepted" isFullTable key="b" />],
  ["Pago en revisión", <DetailCard status="verification_payment" key="c" />],
  ["Vista de compañero", <DetailCard status="pending" isOwner={false} key="d" />],
  ["Liberada", <DetailCard status="released" key="e" />],
];

it("writes the preview", () => {
  const body = STATES.map(
    ([name, element]) =>
      `<section class="preview"><h4 class="preview-label">${name}</h4>${renderToStaticMarkup(element)}</section>`,
  ).join("\n");
  writeFileSync(process.env.PREVIEW_OUT!, body, "utf8");
});
