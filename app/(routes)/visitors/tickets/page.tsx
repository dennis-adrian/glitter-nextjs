import { DateTime } from "luxon";
import { Metadata } from "next";

import DownloadableTicket from "@/app/components/events/registration/downloadable-ticket";
import { Badge } from "@/app/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import ForgetVisitorButton from "@/app/components/visitors/forget-visitor-button";
import TicketHistoryLinkForm from "@/app/components/visitors/ticket-history-link-form";
import { formatDate, formatDisplayDate } from "@/app/lib/formatters";
import { visitorTicketHistory } from "@/app/lib/visitors/registration-data";
import { ticketHistoryVisitorId } from "@/app/lib/visitors/session";

export const metadata: Metadata = {
  title: "Mis entradas",
  description: "Todas tus entradas a los festivales de Productora Glitter",
  robots: { index: false, follow: false },
};

/**
 * A visitor's tickets across every festival. Opens only from the link we
 * email them: entering an email is enough to get a ticket, but not to see
 * someone's whole history.
 */
export default async function Page(props: {
  searchParams: Promise<{ enlace?: string }>;
}) {
  const { enlace } = await props.searchParams;
  const visitorId = await ticketHistoryVisitorId();
  const history =
    visitorId === null ? null : await visitorTicketHistory(visitorId);

  if (!history) {
    return (
      <div className="container max-w-lg p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Mis entradas</CardTitle>
            <CardDescription>
              Ingresa el correo con el que te registraste y te enviaremos un
              enlace para ver todas tus entradas.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {enlace === "vencido" ? (
              <p
                role="alert"
                className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
              >
                El enlace venció o no es válido. Pide uno nuevo.
              </p>
            ) : null}
            <TicketHistoryLinkForm />
          </CardContent>
        </Card>
      </div>
    );
  }

  const today = formatDate(new Date()).startOf("day");
  const upcoming = history.entries
    .filter((entry) => formatDate(entry.date).startOf("day") >= today)
    .reverse();
  const past = history.entries.filter(
    (entry) => formatDate(entry.date).startOf("day") < today,
  );

  return (
    <div className="container flex flex-col gap-8 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Mis entradas</h1>
          <p className="text-sm text-muted-foreground">
            Hola, {history.firstName}.
          </p>
        </div>
        <ForgetVisitorButton />
      </div>

      <section className="grid gap-3" aria-labelledby="upcoming-tickets">
        <h2 id="upcoming-tickets" className="text-lg font-medium">
          Próximas
        </h2>
        {upcoming.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No tienes entradas para próximos festivales.
          </p>
        ) : (
          <div className="flex flex-wrap justify-center gap-4 sm:justify-start">
            {upcoming.map((entry) => (
              <DownloadableTicket
                key={entry.id}
                ticket={entry}
                holderName={history.displayName}
                festival={entry.festival}
              />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 ? (
        <section className="grid gap-3" aria-labelledby="past-tickets">
          <h2 id="past-tickets" className="text-lg font-medium">
            Anteriores
          </h2>
          <ul className="divide-y rounded-md border">
            {past.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{entry.festival.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDisplayDate(entry.date, DateTime.DATE_MED)} ·{" "}
                    {entry.code}
                    {entry.numberOfVisitors > 1
                      ? ` · ${entry.numberOfVisitors} personas`
                      : ""}
                  </p>
                </div>
                <Badge variant={entry.status === "checked_in" ? "green" : "outline"}>
                  {entry.status === "checked_in" ? "Asististe" : "No usada"}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
