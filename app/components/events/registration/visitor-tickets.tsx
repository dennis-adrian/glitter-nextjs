"use client";

import { FestivalWithDates } from "@/app/data/festivals/definitions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { PlusCircleIcon } from "lucide-react";
import { useState } from "react";
import { BaseProfile } from "@/app/api/users/definitions";
import { getVisitorFestivalTickets } from "@/app/data/visitors/helpers";
import { Button } from "@/app/components/ui/button";
import AddTicketModal from "@/app/components/events/registration/add-ticket-modal";
import DownloadableTicket from "@/app/components/events/registration/downloadable-ticket";

export default function VisitorTickets({
  visitor,
  festival,
  currentUser,
}: {
  visitor: VisitorWithTickets;
  festival: FestivalWithDates;
  currentUser?: BaseProfile | null;
}) {
  const [showForm, setShowForm] = useState(false);

  const festivalDates = festival.festivalDates;
  const visitorFestivalTickets = getVisitorFestivalTickets(visitor, festival);
  const takenISODates = visitorFestivalTickets.map((ticket) =>
    ticket.date.toISOString(),
  );
  const availableDates = festivalDates.filter(
    (date) => !takenISODates.includes(date.startDate.toISOString()),
  );

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-semibold sm:text-2xl">Tus Entradas</h1>
        {visitorFestivalTickets.length > 0 && (
          <Button onClick={() => setShowForm(true)}>
            <PlusCircleIcon className="mr-1 inline-block h-4 w-4" />
            <span>Nueva entrada</span>
          </Button>
        )}
      </div>
      {visitorFestivalTickets.length === 0 ? (
        <div className="flex border py-8 rounded-md text-muted-foreground justify-center items-center flex-col gap-2">
          <span>No tienes entradas para este evento</span>
          <Button onClick={() => setShowForm(true)}>
            <PlusCircleIcon className="mr-1 inline-block h-4 w-4" />
            <span>Nueva entrada</span>
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-4 justify-center">
          {visitorFestivalTickets.map((ticket, index) => (
            <DownloadableTicket
              ticket={ticket}
              key={index}
              visitor={visitor}
              festival={festival}
            />
          ))}
        </div>
      )}

      <AddTicketModal
        festival={festival}
        festivalDates={availableDates}
        open={showForm}
        visitor={visitor}
        onOpenChange={setShowForm}
      />
    </>
  );
}
