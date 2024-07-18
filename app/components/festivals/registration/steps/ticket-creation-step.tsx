"use client";

import EventDayTicketCreationForm from "@/app/components/events/registration/event-day-ticket-creation-form";
import Tickets from "@/app/components/events/registration/tickets";
import StepDescription from "@/app/components/festivals/registration/steps/step-decription";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { getVisitorFestivalTickets } from "@/app/data/visitors/helpers";
import { formatDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";
import { useState } from "react";

type TicketCreationStepProps = {
  festival: FestivalWithDates;
  visitor: VisitorWithTickets;
};

export default function TicketCreationStep(props: TicketCreationStepProps) {
  const [showCreatedTicket, setShowCreatedTicket] = useState(false);

  if (props.visitor) {
    const tickets = getVisitorFestivalTickets(props.visitor, props.festival);

    return (
      <>
        <StepDescription
          title={`¡Bienvenido, ${props.visitor.firstName}!`}
          description="Gracias por visitarnos nuevamente, esperamos tengas la mejor de las experiencias "
        />
        {showCreatedTicket ? (
          <div className="rounded-lg border  bg-gradient-to-b from-[#CDE6D2] via-[#fff] to-[#FFFFFF]">
            <div className="flex items-center justify-between rounded-t-lg p-4 pb-0">
              <h2 className="text-xl font-semibold">Entrada</h2>
              <div className="rounded-xl bg-[#64731F] px-2 py-1 text-sm text-white">
                {formatDate(new Date()).toLocaleString(
                  DateTime.DATE_MED_WITH_WEEKDAY,
                )}
              </div>
            </div>
            <div className="p-4">
              <span>{props.festival.name}</span>
              <p className="text-muted-foreground text-sm">
                {props.festival.locationLabel} - {props.festival.address}
              </p>
            </div>
          </div>
        ) : tickets.length > 0 ? (
          <Tickets tickets={tickets} festival={props.festival} />
        ) : (
          <EventDayTicketCreationForm
            festival={props.festival}
            visitor={props.visitor}
            onSuccess={() => setShowCreatedTicket(true)}
          />
        )}
      </>
    );
  }

  return null;
}
