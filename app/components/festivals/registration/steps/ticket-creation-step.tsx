"use client";

import EventDayTicketCreationForm from "@/app/components/events/registration/event-day-ticket-creation-form";
import Tickets from "@/app/components/events/registration/tickets";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { getVisitorFestivalTickets } from "@/app/data/visitors/helpers";
import { formatDate } from "@/app/lib/formatters";

type TicketCreationStepProps = {
  festival: FestivalWithDates;
  visitor?: VisitorWithTickets | null;
  numberOfVisitors?: number;
};

export default function TicketCreationStep(props: TicketCreationStepProps) {
  if (props.visitor) {
    const tickets = getVisitorFestivalTickets(props.visitor, props.festival);
    const currentDayTicket = tickets.find((ticket) => {
      return formatDate(ticket.date)
        .startOf("day")
        .equals(formatDate(new Date()).startOf("day"));
    });

    return (
      <>
        <StepDescription
          title={`¡Bienvenido, ${props.visitor.firstName}!`}
          description="Gracias por visitarnos nuevamente, esperamos tengas la mejor de las experiencias "
        />
        {currentDayTicket ? (
          <Tickets
            visitor={props.visitor}
            tickets={tickets}
            festival={props.festival}
          />
        ) : (
          <EventDayTicketCreationForm
            festival={props.festival}
            numberOfVisitors={props.numberOfVisitors}
            visitor={props.visitor}
          />
        )}
      </>
    );
  }

  return null;
}
