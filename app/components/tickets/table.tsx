import { DataTable } from "@/app/components/ui/data_table/data-table";
import { columnTitles, columns } from "@/app/components/tickets/columns";
import { TicketWithVisitor } from "@/app/data/tickets/actions";
import { formatFullDate } from "@/app/lib/formatters";
import { FestivalWithDates } from "@/app/data/festivals/definitions";

type UsersTableProps = {
  festival: FestivalWithDates;
  tickets: TicketWithVisitor[];
  status?: TicketWithVisitor["status"];
  columnVisbility?: Record<string, boolean>;
};
export default function TicketsTable(props: UsersTableProps) {
  const dates = props.festival.festivalDates;
  return (
    <DataTable
      columns={columns}
      columnTitles={columnTitles}
      data={props.tickets}
      filters={[
        {
          columnId: "date",
          label: "Fecha de la entrada",
          options: [
            {
              label: "Primer día",
              value: formatFullDate(dates[0]?.startDate),
            },
            {
              label: "Segundo día",
              value: formatFullDate(dates[dates.length - 1]?.startDate),
            },
          ],
        },
      ]}
      initialState={{
        columnVisibility: {
          ...props.columnVisbility,
        },
        columnFilters: [
          {
            id: "status",
            value: props.status,
          },
        ],
      }}
    />
  );
}
