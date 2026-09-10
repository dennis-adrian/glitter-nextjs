"use client";

import { FullReservationWithTender } from "@/app/api/reservations/definitions";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { externalParticipantTypeOptions } from "@/app/lib/external_participants/definitions";
import { COVERAGE_FILTER_OPTIONS } from "@/app/lib/payments/coverage";
import {
  lensInitialState,
  type ConsoleLens,
} from "@/app/lib/reservations/console-lenses";
import { userCategoryOptions } from "@/app/lib/utils";
import { columns, columnTitles, CREDIT_SOURCE_FILTER_OPTIONS } from "./columns";

export default function ReservationsTable({
  data,
  canMutate = false,
  lens = "reservas",
}: {
  data: FullReservationWithTender[];
  canMutate?: boolean;
  /** Which column preset to open on. Everything stays reachable via the view menu. */
  lens?: ConsoleLens;
}) {
  return (
    <DataTable
      // Remounts on a lens change so the preset's visibility and filters take
      // effect; initialState is only read when the table is created.
      key={lens}
      columns={columns(canMutate)}
      data={data}
      columnTitles={columnTitles}
      initialState={lensInitialState(lens)}
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
          label: "Pago",
          columnId: "coverage",
          options: COVERAGE_FILTER_OPTIONS,
        },
        {
          label: "Créditos",
          columnId: "creditSource",
          options: CREDIT_SOURCE_FILTER_OPTIONS,
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
