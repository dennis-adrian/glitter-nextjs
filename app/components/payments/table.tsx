"use client";

import { columns, columnTitles } from "@/app/components/payments/columns";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { InvoiceWithParticipants } from "@/app/data/invoices/definitions";
import { userCategoryOptions } from "@/app/lib/utils";

type PaymentsTableProps = {
  invoices: InvoiceWithParticipants[];
  status?: InvoiceWithParticipants["status"];
  columnVisbility?: Record<string, boolean>;
  isAdmin?: boolean;
};

export default function PaymentsTable(props: PaymentsTableProps) {
  return (
    <>
      <DataTable
        columns={columns(props.isAdmin ?? false)}
        columnTitles={columnTitles}
        data={props.invoices}
        filters={[
          {
            label: "Categoría",
            columnId: "category",
            options: [...userCategoryOptions],
          },
          {
            label: "Estado de la reserva",
            columnId: "reservationStatus",
            options: [
              { value: "pending", label: "Pendiente" },
              { value: "verification_payment", label: "Verificacion de Pago" },
              { value: "accepted", label: "Confirmada" },
              { value: "rejected", label: "Rechazada" },
            ],
          },
        ]}
        initialState={{
          columnVisibility: {
            status: props.status === undefined,
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
    </>
  );
}
