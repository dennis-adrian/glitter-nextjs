"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProfileType } from "@/app/api/users/definitions";
import SocialsCell from "@/app/dashboard/users/cells/socials";
import { ActionsCell } from "@/app/dashboard/users/cells/actions";
import UserRoleBadge from "@/app/components/user-role-badge";

export const columns: ColumnDef<ProfileType>[] = [
  {
    accessorKey: "id",
    header: "ID",
  },
  {
    header: "Nombre de artista",
    accessorKey: "displayName",
  },
  {
    header: "Nombre",
    cell: ({ row }) => {
      const name = `${row.original.firstName || ""} ${
        row.original.lastName || ""
      }`;
      return <div>{name}</div>;
    },
  },
  {
    header: "Email",
    accessorKey: "email",
  },
  {
    header: "Redes",
    cell: ({ row }) => {
      const socials = row.original.userSocials;
      return <SocialsCell socials={socials} />;
    },
  },
  {
    id: "role",
    header: "Rol",
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

const columnsExample: ColumnDef<ProfileType>[] = [
  {
    accessorKey: "id",
    header: "ID",
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      debugger;
      row.getValue("");
      return <div>hello</div>;
    },
  },
  {
    accessorKey: "amount",
    header: () => <div className="text-right">Amount</div>,
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("amount"));
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(amount);

      return <div className="text-right font-medium">{formatted}</div>;
    },
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const payment = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() =>
                navigator.clipboard.writeText(payment.id.toString())
              }
            >
              Copy payment ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>View customer</DropdownMenuItem>
            <DropdownMenuItem>View payment details</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
