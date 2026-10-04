"use client";

import { Loader2Icon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import Tickets from "@/app/components/events/registration/tickets";
import { Button } from "@/app/components/ui/button";
import { formatDate } from "@/app/lib/formatters";
import { claimDoorTicket } from "@/app/lib/visitors/registration-actions";
import type {
  TicketFestivalView,
  VisitorRegistrationView,
  VisitorTicketView,
} from "@/app/lib/visitors/registration-definitions";

/** The visitor's ticket for today, in the store's time zone. */
export function todaysTicket(
  tickets: VisitorTicketView[],
): VisitorTicketView | undefined {
  const today = formatDate(new Date()).startOf("day");
  return tickets.find((ticket) =>
    formatDate(ticket.date).startOf("day").equals(today),
  );
}

type TicketCreationStepProps = {
  festivalId: number;
  festival: TicketFestivalView;
  view: VisitorRegistrationView;
  numberOfVisitors: number;
  onSuccess: (view: VisitorRegistrationView) => void;
  /** The visitor's session expired: start again from the email. */
  onRestart: () => void;
};

export default function TicketCreationStep(props: TicketCreationStepProps) {
  const [pending, startTransition] = useTransition();
  const ticket = todaysTicket(props.view.tickets);

  function claim() {
    startTransition(async () => {
      const res = await claimDoorTicket({
        festivalId: props.festivalId,
        numberOfVisitors: Math.max(1, props.numberOfVisitors),
      });
      if (res.success) {
        toast.success(res.message);
        props.onSuccess(res.view);
        return;
      }
      toast.error(res.message);
      if (res.restart) props.onRestart();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-lg md:text-2xl font-bold text-center">
        ¡Gracias por visitarnos, {props.view.firstName}!
      </h1>
      {ticket ? (
        <div>
          <div className="text-sm md:text-base text-center mb-1">
            Muestra tu entrada en puerta para ingresar al evento
          </div>
          <Tickets
            tickets={[ticket]}
            holderName={props.view.displayName}
            festival={props.festival}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="text-center text-sm md:text-lg border-2 border-dotted border-muted p-4 rounded-md text-muted-foreground">
            Aún no tienes entrada para hoy
          </div>
          <Button disabled={pending} className="w-full" onClick={claim}>
            {pending ? (
              <span className="flex items-center gap-2">
                <Loader2Icon className="h-4 w-4 animate-spin" />
                Generando tu entrada...
              </span>
            ) : (
              <span>Obtener mi entrada de hoy</span>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
