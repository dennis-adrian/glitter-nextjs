import { TicketIcon } from "lucide-react";

import { fetchFestival } from "@/app/data/festivals/actions";
import TotalsCard from "@/app/components/dashboard/totals/card";
import { formatDate, getWeekdayFromDate } from "@/app/lib/formatters";
import { RedirectButton } from "@/app/components/redirect-button";
import { currentUser } from "@clerk/nextjs/server";
import { fetchUserProfile } from "@/app/api/users/actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TicketsTable from "@/app/components/tickets/table";

export default async function Page({ params }: { params: { id: string } }) {
  const user = await currentUser();
  let profile = null;
  if (user) {
    profile = await fetchUserProfile(user.id);
  }

  const festival = await fetchFestival(parseInt(params.id));
  if (!festival) {
    return (
      <div className="text-muted-foreground flex min-h-full items-center justify-center">
        No se encontraron resultados
      </div>
    );
  }

  const tickets = festival.tickets;
  const firstDayTickets = tickets.filter((ticket) => {
    return (
      formatDate(ticket.date).toLocaleString() ===
      formatDate(festival.startDate).toLocaleString()
    );
  });
  const secondDayTickets = tickets.filter((ticket) => {
    return (
      formatDate(ticket.date).toLocaleString() ===
      formatDate(festival.endDate).toLocaleString()
    );
  });

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
            amount={festival.tickets.length}
            title="entradas en total"
            description="Entradas para el evento"
            Icon={TicketIcon}
          />
          <TotalsCard
            amount={firstDayTickets.length}
            title="entradas primer día"
            description={`Entradas para el ${getWeekdayFromDate(
              festival.startDate,
              "long",
            )}`}
          />
          <TotalsCard
            amount={secondDayTickets.length}
            title="entradas segundo día"
            description={`Entradas para el ${getWeekdayFromDate(
              festival.endDate,
              "long",
            )}`}
          />
        </div>
      )}

      <Tabs defaultValue="pending" className="my-4">
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
      </Tabs>
    </div>
  );
}
