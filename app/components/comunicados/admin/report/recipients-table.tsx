import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import type { ComunicadoRecipientRow } from "@/app/lib/comunicados/report";
import { COMUNICADO_SOURCE_LABELS } from "@/app/lib/comunicados/skip-reasons";

/**
 * One page of who the comunicado was for (G6): how each person entered the
 * audience, and where it reached them in the app, by email and on a device.
 */
export default function RecipientsTable({
  rows,
}: {
  rows: ComunicadoRecipientRow[];
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        Nadie coincide con este filtro.
      </p>
    );
  }

  return (
    <div className="overflow-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Persona</TableHead>
            <TableHead>Origen</TableHead>
            <TableHead>App</TableHead>
            <TableHead>Correo</TableHead>
            <TableHead>Dispositivo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.userId}>
              <TableCell className="min-w-56">
                <p className="break-words font-medium">{row.name}</p>
                <p className="break-all text-xs text-muted-foreground">
                  {row.email}
                </p>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {row.source ? COMUNICADO_SOURCE_LABELS[row.source] : "—"}
              </TableCell>
              <TableCell className="min-w-32">{row.app}</TableCell>
              <TableCell className="min-w-40">{row.emailLabel}</TableCell>
              <TableCell className="whitespace-nowrap">{row.device}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
