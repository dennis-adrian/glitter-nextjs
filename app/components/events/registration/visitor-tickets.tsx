"use client";

import { FestivalWithDates } from "@/app/data/festivals/definitions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { PlusCircleIcon } from "lucide-react";
import { useState } from "react";
import { BaseProfile } from "@/app/api/users/definitions";
import { getVisitorFestivalTickets } from "@/app/data/visitors/helpers";
import { Button } from "@/app/components/ui/button";
import AddTicketModal from "@/app/components/events/registration/add-ticket-modal";
import Ticket from "@/app/components/events/registration/ticket";

export default function VisitorTickets({
  visitor,
  festival,
  currentUser,
}: {
  visitor: VisitorWithTickets;
  festival: FestivalWithDates;
  currentUser?: BaseProfile | null;
}) {
  // const [showTicketModal, setShowTicketModal] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const festivalDates = festival.festivalDates;
  const visitorFestivalTickets = getVisitorFestivalTickets(visitor, festival);

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
        <div>
          {visitorFestivalTickets.map((ticket, index) => (
            <Ticket
              ticket={ticket}
              key={index}
              visitor={visitor}
              festival={festival}
            />
          ))}
        </div>
      )}
      {/* {visitorFestivalTickets.length > 0 && (
        <Tickets
          visitor={visitor}
          tickets={visitorFestivalTickets}
          festival={festival}
        />
      )}
      {!showForm &&
        visitorFestivalTickets.length < festivalDates.length - 1 && (
          <div
            className="my-4 flex cursor-pointer items-center justify-center hover:underline"
            onClick={() => setShowForm(true)}
          >
            <PlusCircleIcon className="mr-1 inline-block h-4 w-4" />
            Adquirir otra entrada
          </div>
        )}
      {(showForm && visitorFestivalTickets.length === 1) ||
      visitorFestivalTickets.length === 0 ? (
        <div className="p-4">
          <TicketCreationForm
            festival={festival}
            visitor={visitor}
            onSuccess={() => setShowTicketModal(true)}
          />
        </div>
      ) : null}

      <TicketModal
        show={showTicketModal}
        visitor={visitor}
        festival={festival}
        onOpenChange={setShowTicketModal}
      />

      {(currentUser?.role === "admin" ||
        currentUser?.role === "festival_admin") && (
        <div className="mt-4 flex w-full justify-center">
          <RedirectButton href={`/dashboard/festivals/${festival.id}/tickets`}>
            Ver entradas
          </RedirectButton>
        </div>
      )} */}
      <AddTicketModal
        festival={festival}
        festivalDates={festivalDates}
        open={showForm}
        visitor={visitor}
        onOpenChange={setShowForm}
      />
    </>
  );
}
