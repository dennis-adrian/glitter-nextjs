"use client";

import ViewPaymentProofCell from "@/app/components/payments/view-payment-proof-cell";
import { Checkbox } from "@/app/components/ui/checkbox";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { InvoiceWithPaymentsAndStandAndProfile } from "@/app/data/invoices/defiinitions";
import { getInvoiceStatusLabel } from "@/app/lib/payments/helpers";
import { ColumnDef } from "@tanstack/react-table";

export const columnTitles = {
  id: "ID",
  paymentProof: "Comprobante de pago",
  profile: "Perfil",
  status: "Estado",
};

export const columns: ColumnDef<InvoiceWithPaymentsAndStandAndProfile>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "id",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.id} />
    ),
  },
  {
    id: "profile",
    accessorFn: (row) => row.user.displayName,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.profile} />
    ),
  },
  {
    id: "status",
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.status} />
    ),
    cell: ({ row }) => getInvoiceStatusLabel(row.original.status),
    filterFn: (row, columnId, filterStatus) => {
      if (!filterStatus) return true;
      const status = row.getValue(columnId);
      return filterStatus === status;
    },
  },
  {
    id: "paymentProof",
    accessorKey: "paymentProof",
    header: columnTitles.paymentProof,
    cell: ({ row }) => (
      <ViewPaymentProofCell payment={row.original.payments[0]} />
    ),
  },
];
