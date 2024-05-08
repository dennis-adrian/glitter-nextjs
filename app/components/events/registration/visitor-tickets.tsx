"use client";

import { FestivalBase } from "@/app/data/festivals/definitions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { PlusCircleIcon } from "lucide-react";
import { useState } from "react";
import TicketCreationForm from "./ticket-creation-form";
import TicketModal from "./ticket-modal";
import { BaseProfile } from "@/app/api/users/definitions";
import { RedirectButton } from "../../redirect-button";
import { getVisitorFestivalTickets } from "@/app/data/visitors/helpers";
import Tickets from "@/app/components/events/registration/tickets";

export default function VisitorTickets({
  visitor,
  festival,
  currentUser,
}: {
  visitor: VisitorWithTickets;
  festival: FestivalBase;
  currentUser?: BaseProfile | null;
}) {
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const visitorFestivalTickets = getVisitorFestivalTickets(visitor, festival);

  return (
    <>
      <h1 className="text-xl mb-2 font-semibold sm:text-2xl">
        Confirmación de Entradas
      </h1>
      {visitorFestivalTickets.length > 0 && (
        <Tickets tickets={visitorFestivalTickets} festival={festival} />
      )}
      {!showForm && visitorFestivalTickets.length === 1 && (
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
      )}
    </>
  );
}
