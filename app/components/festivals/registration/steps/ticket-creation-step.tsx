"use client";

import EventDayTicketCreationForm from "@/app/components/events/registration/event-day-ticket-creation-form";
import Tickets from "@/app/components/events/registration/tickets";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { getVisitorFestivalTickets } from "@/app/data/visitors/helpers";
import { formatDate } from "@/app/lib/formatters";
import { useState } from "react";

type TicketCreationStepProps = {
  festival: FestivalWithDates;
  visitor?: VisitorWithTickets | null;
  numberOfVisitors?: number;
};

export default function TicketCreationStep(props: TicketCreationStepProps) {
  const [visitorWithTicket, setVisitorWithTicket] =
    useState<VisitorWithTickets | null>(props.visitor || null);

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

  const tickets = getVisitorFestivalTickets(visitorWithTicket!, props.festival);
  const currentDayTicket = tickets.find((ticket) => {
    return formatDate(ticket.date)
      .startOf("day")
      .equals(formatDate(new Date()).startOf("day"));
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg md:text-2xl font-bold text-center">
        ¡Gracias por visitarnos, {props.visitor.firstName}!
      </h1>
      {currentDayTicket ? (
        <div>
          <div className="text-sm md:text-base text-center mb-2">
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
              setVisitorWithTicket(visitor);
            }}
          />
        </div>
      )}
    </div>
  );
}
