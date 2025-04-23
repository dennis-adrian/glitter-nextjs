import { DataTable } from "@/app/components/ui/data_table/data-table";
import { columns, columnTitles } from "./columns";
import { FullReservation } from "@/app/api/reservations/definitions";

export default function ReservationsTable({
  data,
}: {
  data: FullReservation[];
}) {
  return (
    <DataTable
      columns={columns}
      data={data}
      columnTitles={columnTitles}
      initialState={{
        columnVisibility: {
          festivalId: false,
          paymentStatus: false,
          createdAt: false,
        },
      }}
    />
  );
}
