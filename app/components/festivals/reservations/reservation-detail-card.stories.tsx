import { ArrowRightIcon } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import Title from "@/app/components/atoms/heading";
import ReservationAvailableActions from "@/app/components/festivals/reservations/reservation-available-actions";
import ReservationSpaceSummary from "@/app/components/festivals/reservations/reservation-space-summary";
import ReservationStatusPanel from "@/app/components/festivals/reservations/reservation-status-panel";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { participantStatusCopy } from "@/app/lib/reservations/participant-status";

import type { ReservationAction } from "@/app/components/festivals/reservations/reservation-available-actions";

/**
 * The participant's reservation detail screen, composed exactly as
 * `reservation-detail.tsx` composes it, so this story is a faithful picture of
 * the real page.
 *
 * The action controls are client components bound to server actions, so they
 * are stood in for by markup of the same shape — an outline button, and the
 * cost line plus buy button the release control renders when credits are
 * short. Layout is the whole point of the story.
 */
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
  const copy = participantStatusCopy(status);
  if (!copy) return null;

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

/**
 * Both actions at once, with the release short of credits — the combination
 * that used to render a button, somebody else's sentence and a second button
 * on one line.
 */
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

const meta = {
  title: "Reservations/Reservation detail",
  component: DetailCard,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof DetailCard>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The screen a participant lands on with a payment outstanding. */
export const PendienteDePago: Story = {
  args: { status: "pending", actions: ACTIONS },
};

/** Both halves of a declared pair, already paid. */
export const MesaCompletaConfirmada: Story = {
  args: { status: "accepted", isFullTable: true },
};

/** The voucher is in and nobody has to do anything. */
export const PagoEnRevision: Story = {
  args: { status: "verification_payment" },
};

/** A partner: the same reservation, with no controls and no payment. */
export const VistaDeCompanero: Story = {
  args: { status: "pending", isOwner: false },
};

/** Closed, with the space back on the map. */
export const Liberada: Story = {
  args: { status: "released" },
};
