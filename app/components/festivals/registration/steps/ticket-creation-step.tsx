"use client";

import EventDayTicketCreationForm from "@/app/components/events/registration/event-day-ticket-creation-form";
import Tickets from "@/app/components/events/registration/tickets";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { getVisitorFestivalTickets } from "@/app/data/visitors/helpers";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";

type TicketCreationStepProps = {
  festival: FestivalWithDates;
  visitor?: VisitorWithTickets | null;
  numberOfVisitors?: number;
  onSuccess: (visitor: VisitorWithTickets) => void;
};

export default function TicketCreationStep(props: TicketCreationStepProps) {
  if (!props.visitor?.id) return null;

  const ticketDate = props.festival.festivalDates.find((festivalDate) => {
    return formatDate(festivalDate.startDate)
      .startOf("day")
      .equals(formatDate(new Date()).startOf("day"));
  });

  if (!ticketDate) {
    return (
      <div className="text-center text-sm md:text-lg border-2 border-dotted border-muted p-4 rounded-md text-muted-foreground">
        No tenemos entradas disponibles para hoy
      </div>
    );
  }

  const tickets = getVisitorFestivalTickets(props.visitor, props.festival);
  const currentDayTicket = tickets.find((ticket) => {
    return formatDate(ticket.date)
      .startOf("day")
      .equals(formatDate(new Date()).startOf("day"));
  });

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-lg md:text-2xl font-bold text-center">
        ¡Gracias por visitarnos, {props.visitor.firstName}!
      </h1>
      {currentDayTicket ? (
        <div>
          <div className="text-sm md:text-base text-center mb-1">
            Muestra tu entrada en puerta para ingresar al evento
          </div>
          <Tickets
            visitor={props.visitor}
            tickets={tickets}
            festival={props.festival}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="text-center text-sm md:text-lg border-2 border-dotted border-muted p-4 rounded-md text-muted-foreground">
            Aún no tienes entradas para este día
          </div>
          <EventDayTicketCreationForm
            festival={props.festival}
            numberOfVisitors={props.numberOfVisitors}
            visitor={props.visitor}
            onSuccess={(visitor) => {
              props.onSuccess(visitor);
            }}
          />
        </div>
      )}
    </div>
  );
}
