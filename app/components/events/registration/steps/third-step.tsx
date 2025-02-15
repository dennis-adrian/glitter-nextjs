"use client";

import { BaseProfile } from "@/app/api/users/definitions";
import EventDayTicketCreationForm from "@/app/components/events/registration/event-day-ticket-creation-form";
import Tickets from "@/app/components/events/registration/tickets";
import VisitorTickets from "@/app/components/events/registration/visitor-tickets";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import { hasTicketForTheDay } from "@/app/data/tickets/utils";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { getVisitorFestivalTickets } from "@/app/data/visitors/helpers";

type ThirdStepProps = {
  festival: FestivalWithDates;
  visitor: VisitorWithTickets;
  profile?: BaseProfile | null;
};

export default function ThirdStep(props: ThirdStepProps) {
  const tickets = getVisitorFestivalTickets(props.visitor, props.festival);
  if (!props.festival.eventDayRegistration)
    return (
      <VisitorTickets
        festival={props.festival}
        visitor={props.visitor}
        currentUser={props.profile}
      />
    );

  if (!hasTicketForTheDay(props.visitor)) {
    return (
      <div className="min-w-80 lg:max-w-96 m-auto flex flex-col gap-4">
        <h1 className="font-semibold text-lg my-4 lg:mt-0">Tus Entradas</h1>
        <div className="w-full flex justify-center items-center h-40 border rounded-lg border-dashed">
          <span className="text-muted-foreground">Sin entradas</span>
        </div>
        <EventDayTicketCreationForm
          festival={props.festival}
          visitor={props.visitor}
          onSuccess={(visitor) => {}}
        />
      </div>
    );
  }

  return (
    <div>
      <Tickets
        visitor={props.visitor}
        tickets={tickets}
        festival={props.festival}
      />
    </div>
  );
}
