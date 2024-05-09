import { ProfileType } from "@/app/api/users/definitions";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { columnTitles, columns } from "@/app/components/tickets/columns";
import { userCategoryOptions } from "@/app/lib/utils";
import { TicketWithVisitor } from "@/app/data/tickets/actions";
import { formatFullDate } from "@/app/lib/formatters";
import { FestivalBase } from "@/app/data/festivals/definitions";

type UsersTableProps = {
  festival: FestivalBase;
  tickets: TicketWithVisitor[];
  status?: TicketWithVisitor["status"];
  columnVisbility?: Record<string, boolean>;
};
export default function TicketsTable(props: UsersTableProps) {
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
              value: formatFullDate(props.festival.startDate),
            },
            {
              label: "Segundo día",
              value: formatFullDate(props.festival.endDate),
            },
          ],
        },
      ]}
      initialState={{
        columnVisibility: {
          fullName: false,
          email: false,
          phoneNumber: false,
          status: false,
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
