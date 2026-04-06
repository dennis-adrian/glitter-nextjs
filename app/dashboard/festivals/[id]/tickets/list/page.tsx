import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TicketsTable from "@/app/components/tickets/table";
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
    <Tabs defaultValue="pending">
      <TabsList>
        <TabsTrigger value="all">Todos</TabsTrigger>
        <TabsTrigger value="confirmed">Confirmados</TabsTrigger>
        <TabsTrigger value="pending">Pendientes</TabsTrigger>
      </TabsList>
      <TabsContent value="all">
        <TicketsTable tickets={tickets} festival={festival} />
      </TabsContent>
      <TabsContent value="confirmed">
        <TicketsTable tickets={tickets} status="checked_in" festival={festival} />
      </TabsContent>
      <TabsContent value="pending">
        <TicketsTable tickets={tickets} status="pending" festival={festival} />
      </TabsContent>
    </Tabs>
  );
}
