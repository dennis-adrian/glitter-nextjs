"use client";

import { FestivalBase } from "@/app/api/festivals/definitions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { formatFullDate, getWeekdayFromDate } from "@/app/lib/formatters";
import { PlusCircleIcon } from "lucide-react";
import { useState } from "react";
import TicketCreationForm from "./ticket-creation-form";
import TicketModal from "./ticket-modal";
import { ProfileWithParticipationsAndRequests } from "@/app/api/users/definitions";
import { RedirectButton } from "../../redirect-button";

export default function VisitorTickets({
  visitor,
  festival,
  currentUser,
}: {
  visitor: VisitorWithTickets;
  festival: FestivalBase;
  currentUser?: ProfileWithParticipationsAndRequests | null;
}) {
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [showForm, setShowForm] = useState(false);
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold sm:text-2xl">
        Confirmación de Entradas
      </h1>
      {visitor.tickets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Tus Entradas</CardTitle>
            <CardDescription>
              Tienes {visitor.tickets.length} entradas para {festival.name}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {visitor.tickets.map((ticket) => (
                <div key={ticket.id} className="rounded-lg border">
                  <div className="flex items-center justify-between rounded-t-lg bg-gradient-to-b from-blue-300 to-blue-100 p-4">
                    <h2 className="text-lg font-semibold">{festival.name}</h2>
                    <div className="rounded-xl bg-blue-900 px-2 py-1 text-sm capitalize text-white">
                      {getWeekdayFromDate(ticket.date, "short")}
                    </div>
                  </div>
                  <div className="p-4">
                    {formatFullDate(new Date(ticket.date))} de 10:00 a 19:00
                    <p className="text-muted-foreground text-sm">
                      {festival.locationLabel}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {!showForm && visitor.tickets.length === 1 && (
        <div
          className="my-4 flex cursor-pointer items-center justify-center hover:underline"
          onClick={() => setShowForm(true)}
        >
          <PlusCircleIcon className="mr-1 inline-block h-4 w-4" />
          Adquirir otra entrada
        </div>
      )}
      {(showForm && visitor.tickets.length === 1) ||
      visitor.tickets.length === 0 ? (
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
