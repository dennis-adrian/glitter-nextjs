"use client";

import { ColumnDef } from "@tanstack/react-table";
import { CopyIcon } from "lucide-react";

import { ProfileType } from "@/app/api/users/definitions";
import UserRoleBadge from "@/app/components/user-role-badge";
import { ActionsCell } from "@/app/components/users/cells/actions";
import SocialsCell from "@/app/components/users/cells/socials";
import { DataTableColumnHeader } from "@/components/ui/data_table/column-header";
import { toast } from "sonner";
import { Checkbox } from "@/app/components/ui/checkbox";
import { EmailCell } from "@/app/components/dashboard/data_table/cells/email";

export const columnTitles = {
  id: "ID",
  displayName: "Nombre de artista",
  fullName: "Nombre",
  email: "Email",
  phoneNumber: "Teléfono",
  role: "Rol",
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
    header: "Redes",
    cell: ({ row }) => {
      const socials = row.original.userSocials;
      return <SocialsCell socials={socials} />;
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
    id: "role",
    accessorKey: "role",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Rol" />
    ),
    cell: ({ row }) => {
      const role = row.original.role;
      return <UserRoleBadge role={role} />;
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const user = row.original;

      return <ActionsCell user={user} />;
    },
  },
];
