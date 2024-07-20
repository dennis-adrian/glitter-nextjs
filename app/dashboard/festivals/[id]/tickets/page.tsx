import { TicketIcon } from "lucide-react";

import { fetchFestivalWithTicketsAndDates } from "@/app/data/festivals/actions";
import TotalsCard from "@/app/components/dashboard/totals/card";
import { formatDate } from "@/app/lib/formatters";
import { RedirectButton } from "@/app/components/redirect-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TicketsTable from "@/app/components/tickets/table";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import TicketsChart from "@/app/components/tickets/chart/chart";

export default async function Page({ params }: { params: { id: string } }) {
  const profile = await getCurrentUserProfile();
  const festival = await fetchFestivalWithTicketsAndDates(parseInt(params.id));
  if (!festival) {
    return (
      <div className="text-muted-foreground flex min-h-full items-center justify-center">
        No se encontraron resultados
      </div>
    );
  }

  const tickets = festival.tickets;
  const dayOne = formatDate(festival.festivalDates[0].startDate);
  const dayTwo =
    festival.festivalDates.length > 1
      ? formatDate(festival.festivalDates[1]?.startDate)
      : null;
  const firstDayTickets = tickets.filter((ticket) => {
    return formatDate(ticket.date).toLocaleString() === dayOne.toLocaleString();
  });

  let secondDayTickets = [];
  if (dayTwo) {
    secondDayTickets = tickets.filter((ticket) => {
      return (
        formatDate(ticket.date).toLocaleString() === dayTwo.toLocaleString()
      );
    });
  }

  return (
    <div className="container min-h-full p-4 md:px-6">
      <div className="my-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold md:text-3xl">Entradas </h1>
        <RedirectButton href={`/festivals/${festival.id}/registration`}>
          Nueva entrada
        </RedirectButton>
      </div>
      {profile && profile.role === "admin" && (
        <div className="flex gap-2 md:gap-4 flex-wrap">
          <TotalsCard
            amount={festival.tickets
              .map((ticket) => ticket.numberOfVisitors)
              .reduce((a, b) => a + b, 0)}
            title="visitantes en total"
            description="Entradas para el evento"
            Icon={TicketIcon}
          />
          {dayTwo && (
            <>
              <TotalsCard
                amount={firstDayTickets.length}
                title="entradas primer día"
                description={`Entradas para el ${dayOne.weekdayLong}`}
              />
              <TotalsCard
                amount={secondDayTickets.length}
                title="entradas segundo día"
                description={`Entradas para el ${dayTwo.weekdayLong}`}
              />
            </>
          )}
        </div>
      )}

      <div className="my-6">
        <TicketsChart tickets={tickets} />
      </div>

      {/* <Tabs defaultValue="pending" className="my-4">
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="confirmed">Confirmados</TabsTrigger>
          <TabsTrigger value="pending">Pendientes</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <TicketsTable tickets={tickets} festival={festival} />
        </TabsContent>
        <TabsContent value="confirmed">
          <TicketsTable
            tickets={tickets}
            status="checked_in"
            festival={festival}
          />
        </TabsContent>
        <TabsContent value="pending">
          <TicketsTable
            tickets={tickets}
            status="pending"
            festival={festival}
          />
        </TabsContent>
      </Tabs> */}
    </div>
  );
}
