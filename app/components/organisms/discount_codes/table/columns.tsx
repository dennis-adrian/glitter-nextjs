"use client";

import { ColumnDef } from "@tanstack/react-table";
import { DiscountCodeWithRelations } from "@/app/lib/discount_codes/definitions";
import { Badge } from "@/app/components/ui/badge";
import Link from "next/link";
import { Button } from "@/app/components/ui/button";

export const columnTitles = {
  code: "Código",
  type: "Tipo",
  value: "Valor",
  festival: "Festival",
  user: "Usuario",
  uses: "Usos",
  expiresAt: "Vence",
  status: "Estado",
};

export const columns: ColumnDef<DiscountCodeWithRelations>[] = [
  {
    id: "code",
    header: columnTitles.code,
    cell: ({ row }) => (
      <span className="font-mono font-medium">{row.original.code}</span>
    ),
  },
  {
    id: "type",
    header: columnTitles.type,
    cell: ({ row }) =>
      row.original.discountUnit === "percentage" ? "Porcentaje" : "Monto fijo",
  },
  {
    id: "value",
    header: columnTitles.value,
    cell: ({ row }) => {
      const { discountUnit, discountValue } = row.original;
      return discountUnit === "percentage"
        ? `${discountValue}%`
        : `Bs${discountValue}`;
    },
  },
  {
    id: "festival",
    header: columnTitles.festival,
    cell: ({ row }) => row.original.festival?.name ?? "Global",
  },
  {
    id: "user",
    header: columnTitles.user,
    cell: ({ row }) => {
      const user = row.original.user;
      if (!user) return "Cualquiera";
      return user.displayName ?? user.email;
    },
  },
  {
    id: "uses",
    header: columnTitles.uses,
    cell: ({ row }) => {
      const { currentUses, maxUses } = row.original;
      return maxUses !== null ? `${currentUses} / ${maxUses}` : currentUses;
    },
  },
  {
    id: "expiresAt",
    header: columnTitles.expiresAt,
    cell: ({ row }) =>
      new Date(row.original.expiresAt).toLocaleDateString("es-BO"),
  },
  {
    id: "status",
    header: columnTitles.status,
    cell: ({ row }) =>
      row.original.isActive ? (
        <Badge>Activo</Badge>
      ) : (
        <Badge variant="secondary">Inactivo</Badge>
      ),
  },
  {
    id: "actions",
    header: "Acciones",
    cell: ({ row }) => (
      <Button asChild size="sm" variant="outline">
        <Link href={`/dashboard/discount_codes/${row.original.id}/edit`}>
          Editar
        </Link>
      </Button>
    ),
  },
];
