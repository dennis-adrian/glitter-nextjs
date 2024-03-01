import { TicketIcon } from "lucide-react";

import { fetchFestival } from "@/app/api/festivals/actions";
import TotalsCard from "@/app/components/dashboard/totals/card";
import { columnTitles, columns } from "@/app/components/tickets/table/columns";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { formatFullDate, getWeekdayFromDate } from "@/app/lib/formatters";

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
    <div className="container min-h-full p-4 md:px-6">
      <h1 className="mb-2 text-2xl font-bold md:text-3xl">
        Entradas para {festival.name}
      </h1>
      <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
        <TotalsCard
          amount={festival.tickets.length}
          title="entradas en total"
          description="Entradas para el evento"
          Icon={TicketIcon}
        />
        <TotalsCard
          amount={
            festival.tickets.filter(
              (ticket) =>
                ticket.date.toString() === festival.startDate.toString(),
            ).length
          }
          title="entradas primer día"
          description={`Entradas para el ${getWeekdayFromDate(
            festival.startDate,
            "long",
          )}`}
        />
        <TotalsCard
          amount={
            festival.tickets.filter(
              (ticket) =>
                ticket.date.toString() === festival.endDate.toString(),
            ).length
          }
          title="entradas segundo día"
          description={`Entradas para el ${getWeekdayFromDate(
            festival.endDate,
            "long",
          )}`}
        />
      </div>

      <DataTable
        columns={columns}
        columnTitles={columnTitles}
        data={tickets}
        filters={[
          {
            columnId: "status",
            label: "Estado de la asistencia",
            options: [
              { label: "Pendiente", value: "pending" },
              { label: "Confirmada", value: "checked_in" },
            ],
          },
          {
            columnId: "date",
            label: "Fecha de la entrada",
            options: [
              {
                label: "Primer día",
                value: formatFullDate(festival.startDate),
              },
              { label: "Segundo día", value: formatFullDate(festival.endDate) },
            ],
          },
        ]}
      />
    </div>
  );
}
