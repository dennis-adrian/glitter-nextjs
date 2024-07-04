"use client";

import { ColumnDef } from "@tanstack/react-table";

import { ProfileType } from "@/app/api/users/definitions";
import { ActionsCell } from "@/app/components/users/cells/actions";
import SocialsCell from "@/app/components/users/cells/socials";
import { DataTableColumnHeader } from "@/components/ui/data_table/column-header";
import { Checkbox } from "@/app/components/ui/checkbox";
import { EmailCell } from "@/app/components/dashboard/data_table/cells/email";
import CategoryBadge from "@/app/components/category-badge";
import { getCategoryOccupationLabel } from "@/app/lib/maps/helpers";
import { isProfileComplete } from "@/app/lib/utils";

export const columnTitles = {
  id: "ID",
  category: "Categoría",
  displayName: "Nombre de artista",
  fullName: "Nombre",
  email: "Email",
  socials: "Redes",
  status: "Estado",
  phoneNumber: "Teléfono",
  verified: "Verificado",
};

export const columns: ColumnDef<ProfileType>[] = [
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
    id: "category",
    // i'm using a formated value here because i want these to be recognized by the search filter
    accessorFn: (row) =>
      getCategoryOccupationLabel(row.category, { singular: true }),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.category} />
    ),
    cell: ({ row }) => <CategoryBadge category={row.original.category} />,
    filterFn: (row, columnId, filterCategories) => {
      if (filterCategories.length === 0) return true;
      return filterCategories.includes(row.original.category);
    },
  },
  {
    accessorKey: "displayName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.displayName} />
    ),
  },
  {
    id: "fullName",
    accessorFn: (row) => `${row.firstName} ${row.lastName}`,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nombre" />
    ),
  },
  {
    id: "socials",
    header: columnTitles.socials,
    accessorFn: (row) =>
      row.userSocials
        .map((social) => social.username)
        .filter(Boolean)
        .join(", "),
    cell: ({ row }) => <SocialsCell socials={row.original.userSocials} />,
  },
  {
    id: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.status} />
    ),
    accessorFn: (row) => {
      return isProfileComplete(row) ? "complete" : "missingFields";
    },
    cell: ({ row }) => {
      const user = row.original;
      return isProfileComplete(user) ? "Completo" : "Incompleto";
    },
    filterFn: (row, columnId, filterStatus) => {
      if (!filterStatus) return true;
      const status = row.getValue(columnId);
      return filterStatus === status;
    },
  },
  {
    id: "verified",
    accessorKey: "verified",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.verified} />
    ),
    cell: ({ row }) => (row.original.status === "verified" ? "Sí" : "No"),
    filterFn: (row, columnId, filterStatus) => {
      if (filterStatus.length === 0) return true;
      const status = row.getValue(columnId) ? "verified" : "unverified";
      return filterStatus.includes(status);
    },
  },
  {
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email" />
    ),
    accessorKey: "email",
    cell: ({ row }) => (
      <EmailCell email={row.original.email} key={row.original.email} />
    ),
  },
  {
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.phoneNumber} />
    ),
    accessorKey: "phoneNumber",
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const user = row.original;

      return <ActionsCell user={user} />;
    },
  },
];
