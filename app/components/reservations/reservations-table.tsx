import { FullReservationWithTender } from "@/app/api/reservations/definitions";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { externalParticipantTypeOptions } from "@/app/lib/external_participants/definitions";
import { COVERAGE_FILTER_OPTIONS } from "@/app/lib/payments/coverage";
import { userCategoryOptions } from "@/app/lib/utils";
import { columns, columnTitles } from "./columns";

export default function ReservationsTable({
  data,
}: {
  data: FullReservationWithTender[];
}) {
  return (
    <DataTable
      columns={columns}
      data={data}
      columnTitles={columnTitles}
      initialState={{
        columnVisibility: {
          festivalId: false,
        },
      }}
      filters={[
        {
          label: "Estado de la reserva",
          columnId: "status",
          options: [
            { value: "pending", label: "Pendiente" },
            { value: "verification_payment", label: "Verificación de Pago" },
            { value: "accepted", label: "Confirmada" },
            { value: "rejected", label: "Rechazada" },
          ],
        },
        {
          label: "Cobertura",
          columnId: "paymentStatus",
          options: COVERAGE_FILTER_OPTIONS,
        },
        {
          label: "Categoría",
          columnId: "participantCategory",
          options: [...userCategoryOptions, ...externalParticipantTypeOptions],
        },
      ]}
    />
  );
}
