"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { Button } from "@/app/components/ui/button";
import {
  ExternalParticipant,
  getExternalParticipantCategoryLabel,
} from "@/app/lib/external_participants/definitions";

export const columnTitles = {
  displayName: "Nombre",
  type: "Tipo",
  contactEmail: "Correo",
  contactPhone: "Teléfono",
  actions: "Acciones",
};

export const columns: ColumnDef<ExternalParticipant>[] = [
  {
    id: "displayName",
    header: columnTitles.displayName,
    cell: ({ row }) => (
      <span className="font-medium">{row.original.displayName}</span>
    ),
  },
  {
    id: "type",
    header: columnTitles.type,
    cell: ({ row }) => getExternalParticipantCategoryLabel(row.original),
  },
  {
    id: "contactEmail",
    header: columnTitles.contactEmail,
    cell: ({ row }) => row.original.contactEmail ?? "—",
  },
  {
    id: "contactPhone",
    header: columnTitles.contactPhone,
    cell: ({ row }) => row.original.contactPhone ?? "—",
  },
  {
    id: "actions",
    header: columnTitles.actions,
    cell: ({ row }) => (
      <Button asChild size="sm" variant="outline">
        <Link href={`/dashboard/external_participants/${row.original.id}/edit`}>
          Editar
        </Link>
      </Button>
    ),
  },
];
