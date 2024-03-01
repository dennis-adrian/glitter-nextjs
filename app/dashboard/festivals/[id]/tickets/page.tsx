import { fetchFestival } from "@/app/api/festivals/actions";
import { columnTitles, columns } from "@/app/components/tickets/table/columns";
import { DataTable } from "@/app/components/ui/data_table/data-table";

export default async function Page({ params }: { params: { id: string } }) {
  const festival = await fetchFestival(parseInt(params.id));
  if (!festival) {
    return (
      <div className="text-muted-foreground flex min-h-full items-center justify-center">
        No se encontraron resultados
      </div>
    );
  }

  const tickets = festival.tickets;

  return (
    <div className="px:4 container min-h-full md:px-6">
      <h1>Festival Tickets Page</h1>

      <DataTable columns={columns} columnTitles={columnTitles} data={tickets} />
    </div>
  );
}
