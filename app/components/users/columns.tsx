"use client";

import { ColumnDef } from "@tanstack/react-table";

import { ProfileType } from "@/app/api/users/definitions";
import { ActionsCell } from "@/app/components/users/cells/actions";
import { DataTableColumnHeader } from "@/components/ui/data_table/column-header";
import { Checkbox } from "@/app/components/ui/checkbox";
import { EmailCell } from "@/app/components/dashboard/data_table/cells/email";
import { getCategoryOccupationLabel } from "@/app/lib/maps/helpers";
import { isProfileComplete } from "@/app/lib/utils";
import ProfileStatusCell from "@/app/components/users/cells/profile-status";
import UserInfoCell from "@/app/components/users/cells/user-info";
import { formatDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";
import ProfileCategoryBadge from "@/app/components/user_profile/category-badge";

export const columnTitles = {
  id: "ID",
  category: "Categoría",
  createdAt: "Fecha de creación",
  displayName: "Nombre público",
  fullName: "Nombre",
  email: "Email",
  socials: "Redes",
  status: "Estado",
  phoneNumber: "Teléfono",
  profileStatus: "Estado del perfil",
  userInfo: "Perfil",
  verifiedAt: "Fecha de verificación",
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
  },
  {
    accessorKey: "id",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.id} />
    ),
  },
  {
    accessorKey: "userInfo",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.userInfo} />
    ),
    cell: ({ row }) => <UserInfoCell profile={row.original} />,
  },
  {
    id: "category",
    // i'm using a formated value here because i want these to be recognized by the search filter
    accessorFn: (row) =>
      getCategoryOccupationLabel(row.category, { singular: true }),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.category} />
    ),
    cell: ({ row }) => <ProfileCategoryBadge profile={row.original} />,
    filterFn: (row, columnId, filterCategories) => {
      if (filterCategories.length === 0) return true;
      const category =
        row.original.category === "new_artist"
          ? "illustration"
          : row.original.category;
      return filterCategories.includes(category);
    },
  },
  {
    accessorKey: "displayName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.displayName} />
    ),
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
    id: "profileStatus",
    accessorFn: (row) => row.status,
    accessorKey: "profileStatus",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={columnTitles.profileStatus}
      />
    ),
    cell: ({ row }) => <ProfileStatusCell status={row.original.status} />,
    filterFn: (row, columnId, filterStatus) => {
      if (filterStatus.length === 0) return true;
      return filterStatus.includes(row.original.status);
    },
  },
  {
    id: "fullName",
    accessorFn: (row) => `${row.firstName} ${row.lastName}`,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nombre" />
    ),
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
    id: "verifiedAt",
    accessorKey: "verifiedAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.verifiedAt} />
    ),
    cell: ({ row }) => {
      if (!row.original.verifiedAt) return "--";

      return formatDate(row.original.verifiedAt).toLocaleString(
        DateTime.DATETIME_SHORT,
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.createdAt} />
    ),
    cell: ({ row }) =>
      formatDate(row.original.createdAt).toLocaleString(
        DateTime.DATETIME_SHORT,
      ),
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const user = row.original;
      return <ActionsCell user={user} />;
    },
  },
];
