"use client";

import { columns, columnTitles } from "@/app/components/payments/columns";
import PaymentProofModal from "@/app/components/payments/payment-proof-modal";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { InvoiceWithPaymentsAndStandAndProfile } from "@/app/data/invoices/defiinitions";
import { invoiceStatusOptions, userCategoryOptions } from "@/app/lib/utils";
import { useState } from "react";

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
