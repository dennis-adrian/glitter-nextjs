"use client";

import { PlusCircleIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import AddTicketModal from "@/app/components/events/registration/add-ticket-modal";
import Tickets from "@/app/components/events/registration/tickets";
import { Button } from "@/app/components/ui/button";
import type { FestivalDate } from "@/app/lib/festivals/definitions";
import { forgetVisitor } from "@/app/lib/visitors/registration-actions";
import type {
  TicketFestivalView,
  VisitorRegistrationView,
} from "@/app/lib/visitors/registration-definitions";

export default function VisitorTickets({
  festival,
  view,
  bookableDates,
}: {
  festival: TicketFestivalView & { id: number };
  view: VisitorRegistrationView;
  /** Festival days the visitor can still get a ticket for. */
  bookableDates: FestivalDate[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [leaving, startLeaving] = useTransition();

  function switchVisitor() {
    startLeaving(async () => {
      await forgetVisitor();
      router.push("?step=1");
    });
  }

  const canAddTicket = bookableDates.length > 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Tus Entradas</h1>
          <p className="text-sm text-muted-foreground">
            ¿No eres {view.displayName}?{" "}
            <button
              type="button"
              className="font-medium text-foreground underline disabled:opacity-50"
              onClick={switchVisitor}
              disabled={leaving}
            >
              Usar otro correo
            </button>
          </p>
        </div>
        {view.tickets.length > 0 && canAddTicket && (
          <Button onClick={() => setShowForm(true)}>
            <PlusCircleIcon className="mr-1 inline-block h-4 w-4" />
            <span>Nueva entrada</span>
          </Button>
        )}
      </div>
      {view.tickets.length === 0 ? (
        <div className="flex border py-8 px-4 text-center rounded-md text-muted-foreground justify-center items-center flex-col gap-2">
          <span>No tienes entradas para este evento</span>
          {canAddTicket ? (
            <Button onClick={() => setShowForm(true)}>
              <PlusCircleIcon className="mr-1 inline-block h-4 w-4" />
              <span>Nueva entrada</span>
            </Button>
          ) : (
            <span className="text-sm">
              Ya no quedan fechas disponibles para este festival.
            </span>
          )}
        </div>
      ) : (
        <Tickets
          tickets={view.tickets}
          holderName={view.displayName}
          festival={festival}
        />
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿Buscas tus entradas de otros festivales?{" "}
        <Link href="/visitors/tickets" className="font-medium underline">
          Ver todas mis entradas
        </Link>
      </p>

      <AddTicketModal
        festivalId={festival.id}
        festivalName={festival.name}
        festivalDates={bookableDates}
        open={showForm}
        onOpenChange={setShowForm}
      />
    </>
  );
}
