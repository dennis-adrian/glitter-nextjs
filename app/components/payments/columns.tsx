"use client";

import CategoryBadge from "@/app/components/category-badge";
import PaymentStatus from "@/app/components/payments/payment-status";
import ActionsCell from "@/app/components/payments/cells/actions";
import ViewPaymentProofCell from "@/app/components/payments/cells/view-payment-proof-cell";
import { ReservationStatus } from "@/app/components/reservations/cells/status";
import CoverageCell from "@/app/components/payments/coverage-cell";
import {
  deriveCoverageState,
  type CoverageState,
} from "@/app/lib/payments/coverage";
import { Checkbox } from "@/app/components/ui/checkbox";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { InvoiceWithTender } from "@/app/data/invoices/definitions";
import { formatDate } from "@/app/lib/formatters";
import { getCategoryOccupationLabel } from "@/app/lib/maps/helpers";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import { ColumnDef } from "@tanstack/react-table";
import { DateTime } from "luxon";

export const columnTitles = {
  id: "ID",
  amount: "Monto",
  category: "Categoría",
  coverage: "Cobertura",
  createdAt: "Fecha de creación",
  creditAmount: "Créditos",
  outstandingAmount: "Saldo",
  paymentProof: "Comprobante",
  profile: "Titular",
  stand: "Espacio",
  status: "Estado",
  reservationStatus: "Estado de la reserva",
};

function invoiceCoverageState(invoice: InvoiceWithTender): CoverageState {
  return deriveCoverageState({
    invoiceStatus: invoice.status,
    reservationStatus: invoice.reservation.status,
    tender: invoice.tender,
    dueAt: invoice.dueAt,
  });
}

export const columns = (isAdmin = false): ColumnDef<InvoiceWithTender>[] => [
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
    cell: ({ row }) => (
      <PaymentStatus
        invoiceId={row.original.id}
        status={row.original.status}
        isAdmin={isAdmin}
      />
    ),
    filterFn: (row, columnId, filterStatus) => {
      if (!filterStatus) return true;
      const status = row.getValue(columnId);
      return filterStatus === status;
    },
  },
  {
    id: "coverage",
    accessorFn: (row) => invoiceCoverageState(row),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.coverage} />
    ),
    cell: ({ row }) => (
      <CoverageCell
        state={invoiceCoverageState(row.original)}
        tender={row.original.tender}
        dueAt={row.original.dueAt}
      />
    ),
    filterFn: (row, columnId, filter) => {
      if (!filter || filter.length === 0) return true;
      return filter.includes(row.getValue(columnId));
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
    id: "creditAmount",
    accessorFn: (row) => row.tender.confirmedCreditAmount,
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={columnTitles.creditAmount}
      />
    ),
    cell: ({ row }) =>
      row.original.tender.confirmedCreditAmount > 0
        ? `${row.original.tender.confirmedCreditAmount} Bs`
        : "--",
  },
  {
    id: "outstandingAmount",
    accessorFn: (row) => row.tender.outstandingAmount,
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={columnTitles.outstandingAmount}
      />
    ),
    cell: ({ row }) => `${row.original.tender.outstandingAmount} Bs`,
  },
  {
    id: "paymentProof",
    accessorKey: "paymentProof",
    header: columnTitles.paymentProof,
    cell: ({ row }) => <ViewPaymentProofCell invoice={row.original} />,
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
    accessorFn: (row) => formatStandLabel(row.reservation.stand),
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.createdAt} />
    ),
    cell: ({ row }) =>
      formatDate(row.original.createdAt).toLocaleString(DateTime.DATETIME_MED),
  },
  {
    id: "reservationStatus",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={columnTitles.reservationStatus}
      />
    ),
    accessorFn: (row) => row.reservation.status,
    cell: ({ row }) => (
      <ReservationStatus reservation={row.original.reservation} />
    ),
    filterFn: (row, columnId, filterStatus) => {
      if (filterStatus.length === 0) return true;
      const status = row.getValue(columnId);
      return filterStatus.includes(status);
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      return <ActionsCell invoice={row.original} isAdmin={isAdmin} />;
    },
  },
];
