import TicketsChart from "@/app/components/tickets/chart/chart";
import TicketsByDayChart from "@/app/components/tickets/chart/tickets-by-day-chart";
import { fetchFestivalWithTicketsAndDates } from "@/app/lib/festivals/actions";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const festival = await fetchFestivalWithTicketsAndDates(parseInt(params.id));
  if (!festival) {
    return (
      <div className="text-muted-foreground flex min-h-full items-center justify-center">
        No se encontraron resultados
      </div>
    );
  }

  const tickets = festival.tickets;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <TicketsByDayChart
        tickets={tickets}
        festivalDates={festival.festivalDates}
      />
      <TicketsChart tickets={tickets} festivalDates={festival.festivalDates} />
    </div>
  );
}
