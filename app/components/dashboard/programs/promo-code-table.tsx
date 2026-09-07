import Link from "next/link";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import type { PromoCodeDashboardRow } from "@/app/lib/programs/promo-code-admin-queries";
import { formatMoney } from "@/app/lib/programs/pricing";

type Props = { rows: PromoCodeDashboardRow[] };

export default function PromoCodeTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="font-medium">Todavía no hay códigos de programas.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Crea uno para atribuir inscripciones y ofrecer un precio promocional.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Código</TableHead>
          <TableHead>Programa / aliado</TableHead>
          <TableHead>Descuento</TableHead>
          <TableHead>Usos</TableHead>
          <TableHead>Base aprobada</TableHead>
          <TableHead>Descuento aprobado</TableHead>
          <TableHead>Neto aprobado</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const now = new Date();
          const expired = row.expiresAt !== null && row.expiresAt < now;
          const pending = row.startsAt !== null && row.startsAt > now;
          const active = row.isActive && !expired && !pending;

          return (
            <TableRow key={row.id}>
              <TableCell>
                <code className="rounded bg-muted px-2 py-1 font-semibold">
                  {row.code}
                </code>
              </TableCell>
              <TableCell>
                <p className="font-medium">{row.program.name}</p>
                <p className="text-xs text-muted-foreground">
                  {row.partnerName}
                </p>
              </TableCell>
              <TableCell>{row.discountPercent}%</TableCell>
              <TableCell>
                <p className="font-medium">
                  {row.confirmedUses}
                  {row.maxUses === null ? "" : ` / ${row.maxUses}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.inProgressUses} en proceso · {row.releasedAttempts}{" "}
                  liberados
                </p>
              </TableCell>
              <TableCell>{formatMoney(row.approvedBaseAmount)}</TableCell>
              <TableCell>{formatMoney(row.approvedDiscountAmount)}</TableCell>
              <TableCell>{formatMoney(row.approvedNetAmount)}</TableCell>
              <TableCell>
                <Badge
                  variant={active ? "green" : expired ? "red" : "secondary"}
                >
                  {active
                    ? "Activo"
                    : expired
                      ? "Vencido"
                      : pending
                        ? "Programado"
                        : "Inactivo"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/dashboard/programs/promo-codes/${row.id}`}>
                    Ver
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
