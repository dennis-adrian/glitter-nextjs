"use client";

import { DataTable } from "@/app/components/ui/data_table/data-table";
import { columns, columnTitles } from "@/app/components/payments/columns";
import { InvoiceWithPaymentsAndStandAndProfile } from "@/app/data/invoices/defiinitions";
import { invoiceStatusOptions } from "@/app/lib/utils";
import { useState } from "react";
import PaymentProofModal from "@/app/components/payments/payment-proof-modal";

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
        filters={
          [
            // {
            //   label: "Estado",
            //   columnId: "status",
            //   options: [...invoiceStatusOptions],
            // },
          ]
        }
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
