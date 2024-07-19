"use client";

import EventDayTicketCreationForm from "@/app/components/events/registration/event-day-ticket-creation-form";
import Tickets from "@/app/components/events/registration/tickets";
import StepDescription from "@/app/components/festivals/registration/steps/step-decription";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { getVisitorFestivalTickets } from "@/app/data/visitors/helpers";

type TicketCreationStepProps = {
  festival: FestivalWithDates;
  visitor: VisitorWithTickets;
};

export default function TicketCreationStep(props: TicketCreationStepProps) {
  if (props.visitor) {
    const tickets = getVisitorFestivalTickets(props.visitor, props.festival);

    return (
      <>
        <StepDescription
          title={`¡Bienvenido, ${props.visitor.firstName}!`}
          description="Gracias por visitarnos nuevamente, esperamos tengas la mejor de las experiencias "
        />
        {tickets.length > 0 ? (
          <Tickets tickets={tickets} festival={props.festival} />
        ) : (
          <EventDayTicketCreationForm
            festival={props.festival}
            visitor={props.visitor}
          />
        )}
      </>
    );
  }

  return null;
}
