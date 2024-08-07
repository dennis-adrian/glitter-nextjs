import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { TicketBase } from "@/app/data/tickets/actions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { formatDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";

type TicketsProps = {
  visitor: VisitorWithTickets;
  tickets: TicketBase[];
  festival: FestivalBase;
};

export default function Tickets(props: TicketsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tus Entradas</CardTitle>
        <CardDescription>
          Tienes {props.tickets.length} entradas para {props.festival.name}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {props.tickets.map((ticket) => (
            <div
              key={ticket.id}
              className="rounded-lg border  bg-gradient-to-b from-[#CDE6D2] via-[#fff] to-[#FFFFFF]"
            >
              <div className="flex items-center justify-between rounded-t-lg p-4 pb-0">
                <span className="flex flex-wrap gap-1 items-center">
                  <h2 className="text-xl font-semibold">Entrada </h2>
                  <span className="text-muted-foreground text-sm">
                    ({ticket.numberOfVisitors} persona
                    {ticket.numberOfVisitors > 1 ? "s" : ""})
                  </span>
                </span>
                <div className="self-start rounded-xl bg-[#64731F] px-2 py-1 text-sm text-white">
                  {formatDate(new Date()).toFormat("d MMM")}
                </div>
              </div>
              <div className="p-4">
                {props.visitor.firstName || ""} {props.visitor.lastName || ""}
                <p className="text-muted-foreground text-sm">
                  {props.festival.locationLabel} - {props.festival.address}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
