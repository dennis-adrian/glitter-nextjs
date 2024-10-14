"use client";

import { BaseProfile } from "@/app/api/users/definitions";
import CategoryBadge from "@/app/components/category-badge";
import ProfileCell from "@/app/components/common/table/profile-cell";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { ColumnDef } from "@tanstack/react-table";

export const columnTitles = {
  profile: "Perfil",
  profileCategory: "Categoría",
};

export const columns: ColumnDef<BaseProfile>[] = [
  {
    id: "profile",
    accessorFn: (user) =>
      user.displayName || `${user.firstName} ${user.lastName}`,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.profile} />
    ),
    cell: ({ row }) => <ProfileCell profile={row.original} />,
  },
  {
    id: "profileCategory",
    accessorFn: (user) => user.category,
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={columnTitles.profileCategory}
      />
    ),
    cell: ({ row }) => (
      <span>
        <CategoryBadge category={row.original.category} />
      </span>
    ),
  },
];
