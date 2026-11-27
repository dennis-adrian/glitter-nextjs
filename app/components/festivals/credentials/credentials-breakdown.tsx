"use client";

import { useCredentials } from "@/app/components/festivals/credentials/credentials-context";
import { Badge } from "@/app/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import {
  CREDENTIAL_GROUP_BADGE,
  CREDENTIAL_GROUP_LABELS,
} from "@/app/lib/credentials/definitions";

const number = (value: number) => value.toLocaleString("es-BO");

/**
 * "Desglose por grupo": a table from md up, a stacked list on phones, where
 * five numeric columns would not fit beside the rule.
 */
export default function CredentialsBreakdown() {
  const { view } = useCredentials();
  const { summary } = view;

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-lg">Desglose por grupo</CardTitle>
        <CardDescription>
          Cada fila aplica la regla del grupo para esta edición. Siempre se cuenta por
          espacio: una reserva con 2 espacios recibe el doble. Las reglas se cambian en la
          pestaña Reglas.
        </CardDescription>
      </CardHeader>

      <div className="hidden overflow-x-auto border-t md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Grupo</TableHead>
              <TableHead className="text-right">Personas</TableHead>
              <TableHead className="text-right">Con nombre</TableHead>
              <TableHead className="text-right">Sin nombre</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.rows.map((row) => (
              <TableRow key={row.group}>
                <TableCell>
                  <div className="flex min-w-0 flex-col items-start gap-1">
                    <Badge variant={CREDENTIAL_GROUP_BADGE[row.group]}>
                      {CREDENTIAL_GROUP_LABELS[row.group]}
                    </Badge>
                    <span className="break-words text-xs text-muted-foreground">
                      {row.rule}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{number(row.people)}</TableCell>
                <TableCell className="text-right tabular-nums">{number(row.named)}</TableCell>
                <TableCell className="text-right tabular-nums">{number(row.unnamed)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {number(row.total)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular-nums">{number(summary.people)}</TableCell>
              <TableCell className="text-right tabular-nums">{number(summary.named)}</TableCell>
              <TableCell className="text-right tabular-nums">{number(summary.unnamed)}</TableCell>
              <TableCell className="text-right tabular-nums">{number(summary.total)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <ul className="divide-y border-t md:hidden">
        {summary.rows.map((row) => (
          <li key={row.group} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col items-start gap-1">
                <Badge variant={CREDENTIAL_GROUP_BADGE[row.group]}>
                  {CREDENTIAL_GROUP_LABELS[row.group]}
                </Badge>
                <span className="break-words text-xs text-muted-foreground">{row.rule}</span>
              </div>
              <span className="shrink-0 text-lg font-semibold tabular-nums">
                {number(row.total)}
              </span>
            </div>
            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <div className="flex gap-1">
                <dt>Personas</dt>
                <dd className="font-medium tabular-nums text-foreground">{number(row.people)}</dd>
              </div>
              <div className="flex gap-1">
                <dt>Con nombre</dt>
                <dd className="font-medium tabular-nums text-foreground">{number(row.named)}</dd>
              </div>
              <div className="flex gap-1">
                <dt>Sin nombre</dt>
                <dd className="font-medium tabular-nums text-foreground">{number(row.unnamed)}</dd>
              </div>
            </dl>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 px-4 py-3 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{number(summary.total)}</span>
        </li>
      </ul>
    </Card>
  );
}
