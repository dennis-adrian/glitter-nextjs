import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { TicketBase } from "@/app/data/tickets/actions";
import { formatFullDate, getWeekdayFromDate } from "@/app/lib/formatters";

type TicketsProps = {
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
              <div className="flex items-center justify-between rounded-t-lg p-4">
                <h2 className="text-lg font-semibold">{props.festival.name}</h2>
                <div className="rounded-xl bg-[#64731F] px-2 py-1 text-sm capitalize text-white">
                  {getWeekdayFromDate(ticket.date, "short")}
                </div>
              </div>
              <div className="p-4">
                {formatFullDate(ticket.date)} de 13:00 a 21:00
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
