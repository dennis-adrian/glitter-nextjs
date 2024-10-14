"use client";

import { DataTable } from "@/app/components/ui/data_table/data-table";
import { columnTitles, columns } from "@/components/reservations/columns";
import { ReservationWithParticipantsAndUsersAndStandAndFestivalAndInvoicesWithPayments } from "@/app/api/reservations/definitions";
import { ReservationBase } from "@/app/api/reservations/definitions";

type ReservationsTableProps = {
  festivalOptions: { value: string; label: string }[];
  reservations: ReservationWithParticipantsAndUsersAndStandAndFestivalAndInvoicesWithPayments[];
  status?: ReservationBase["status"];
  columnVisbility?: Record<string, boolean>;
};
export default function ReservationsTable(props: ReservationsTableProps) {
  return (
    <DataTable
      columns={columns}
      columnTitles={columnTitles}
      data={props.reservations}
      filters={[
        {
          label: "Festival",
          columnId: "festivalId",
          options: props.festivalOptions,
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
