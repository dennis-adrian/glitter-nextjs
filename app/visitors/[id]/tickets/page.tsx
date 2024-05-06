"use server";

import { CalendarDaysIcon, CheckIcon, TicketIcon } from "lucide-react";

import { fetchVisitor } from "@/app/data/visitors/actions";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatFullDate, getWeekdayFromDate } from "@/app/lib/formatters";
import { TicketStatusPill } from "@/app/components/tickets/status-pill";
import CheckInForm from "@/app/components/tickets/checkin-form";
import { fetchActiveFestivalBase } from "@/app/data/festivals/actions";
import SendEmailForm from "@/app/components/tickets/send-pending-email-form";

export default async function Page({ params }: { params: { id: string } }) {
  const visitor = await fetchVisitor(parseInt(params.id));
  if (!visitor) {
    return (
      <div className="text-muted-foreground flex min-h-full items-center justify-center ">
        <h1 className="text-2xl font-semibold">No se encontraron entradas</h1>
      </div>
    );
  }

  const activeFestival = await fetchActiveFestivalBase();
  // TODO: Why is sorting not working in the drizzle query?
  let tickets = visitor.tickets.sort((a, b) => (a.date < b.date ? -1 : 1));
  if (activeFestival) {
    tickets = tickets.filter(
      (ticket) => ticket.festivalId === activeFestival.id,
    );
  }

  return (
    <div className="container mx-auto flex min-h-full flex-col gap-2 p-4 md:p-6">
      <div>
        <h1 className="max-w-full truncate text-2xl font-semibold md:text-3xl">
          Entradas para {visitor.firstName} {visitor.lastName}
        </h1>
        <h2 className="text-muted-foreground md:text-lg">{visitor.email}</h2>
      </div>
      {tickets.length > 0 ? (
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {tickets.map((ticket, i) => (
            <Card key={ticket.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Entrada {i + 1}
                  <div className="text-muted-foreground text-lg uppercase">
                    {getWeekdayFromDate(ticket.date, "short")}
                  </div>
                </CardTitle>
                <CardDescription className="flex items-center justify-between text-base">
                  <span className="text-sm">ID: {ticket.id}</span>
                  <span className="flex items-center">
                    <CalendarDaysIcon className="mr-1 h-4 w-4" />
                    {formatFullDate(ticket.date)}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center">
                  <TicketIcon className="text-muted-foreground h-12 w-12" />
                  <TicketStatusPill status={ticket.status} />
                </div>
              </CardContent>
              <CardFooter>
                <div className="flex flex-col w-full gap-2">
                  {ticket.status === "pending" && (
                    <CheckInForm id={ticket.id} />
                  )}
                  {activeFestival && (
                    <SendEmailForm
                      visitor={visitor}
                      festival={activeFestival}
                    />
                  )}
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground m-auto">
          <h1 className="text-xl font-semibold md:text-2xl">
            No se encontraron entradas
          </h1>
        </div>
      )}
    </div>
  );
}
