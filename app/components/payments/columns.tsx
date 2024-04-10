"use client";

import CategoryBadge from "@/app/components/category-badge";
import ActionsCell from "@/app/components/payments/cells/actions";
import ViewPaymentProofCell from "@/app/components/payments/cells/view-payment-proof-cell";
import { Checkbox } from "@/app/components/ui/checkbox";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { InvoiceWithPaymentsAndStandAndProfile } from "@/app/data/invoices/defiinitions";
import { getCategoryOccupationLabel } from "@/app/lib/maps/helpers";
import { getInvoiceStatusLabel } from "@/app/lib/payments/helpers";
import { ColumnDef } from "@tanstack/react-table";

export const columnTitles = {
  id: "ID",
  amount: "Monto",
  category: "Categoría",
  paymentProof: "Comprobante de pago",
  profile: "Perfil",
  stand: "Espacio",
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
    id: "amount",
    accessorKey: "amount",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.amount} />
    ),
    cell: ({ row }) => `${row.original.amount} Bs`,
  },
  {
    id: "paymentProof",
    accessorKey: "paymentProof",
    header: columnTitles.paymentProof,
    cell: ({ row }) => (
      <ViewPaymentProofCell payment={row.original.payments[0]} />
    ),
  },
  {
    id: "category",
    // i'm using a formated value here because i want these to be recognized by the search filter
    accessorFn: (row) =>
      getCategoryOccupationLabel(row.user.category, { singular: true }),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.category} />
    ),
    cell: ({ row }) => <CategoryBadge category={row.original.user.category} />,
    filterFn: (row, columnId, filterCategories) => {
      if (filterCategories.length === 0) return true;
      return filterCategories.includes(row.original.user.category);
    },
  },
  {
    id: "stand",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.stand} />
    ),
    accessorFn: (row) =>
      `${row.reservation.stand.label}${row.reservation.stand.standNumber}`,
  },
  {
    id: "actions",
    cell: ({ row }) => {
      return <ActionsCell invoice={row.original} />;
    },
  },
];
