"use client";

import { DataTable } from "@/app/components/ui/data_table/data-table";
import { columnTitles, columns } from "@/components/reservations/columns";
import { userCategoryOptions } from "@/app/lib/utils";
import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/actions";
import { ReservationBase } from "@/app/api/reservations/definitions";

type ReservationsTableProps = {
  reservations: ReservationWithParticipantsAndUsersAndStand[];
  status?: ReservationBase["status"];
  columnVisbility?: Record<string, boolean>;
};
export default function ReservationsTable(props: ReservationsTableProps) {
  return (
    <DataTable
      columns={columns}
      columnTitles={columnTitles}
      data={props.reservations}
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
