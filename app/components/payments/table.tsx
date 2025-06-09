"use client";

import { columns, columnTitles } from "@/app/components/payments/columns";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { InvoiceWithPaymentsAndStandAndProfile } from "@/app/data/invoices/definitions";
import { userCategoryOptions } from "@/app/lib/utils";

type PaymentsTableProps = {
  invoices: InvoiceWithPaymentsAndStandAndProfile[];
  status?: InvoiceWithPaymentsAndStandAndProfile["status"];
  columnVisbility?: Record<string, boolean>;
};

export default function PaymentsTable(props: PaymentsTableProps) {
  return (
    <>
      <DataTable
        columns={columns}
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
              { value: "accepted", label: "Confirmada" },
              { value: "rejected", label: "Rechazada" },
            ],
          },
        ]}
        initialState={{
          columnVisibility: {
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
    </>
  );
}
