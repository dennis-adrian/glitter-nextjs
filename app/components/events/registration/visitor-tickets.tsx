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

export default function VisitorTickets({
  visitor,
  festival,
}: {
  visitor: VisitorWithTickets;
  festival: FestivalBase;
}) {
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold sm:text-2xl">
        Confirmación de Entradas
      </h1>
      {visitor.tickets.length > 1 && (
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
    </>
  );
}
