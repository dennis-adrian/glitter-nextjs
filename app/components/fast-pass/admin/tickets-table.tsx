import { Badge } from "@/app/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import type { FastPassTicketRow } from "@/app/lib/fast-pass/purchase-queries";
import { FAST_PASS_TICKET_STATUS_LABELS } from "@/app/lib/fast-pass/definitions";
import { formatDateWithTime } from "@/app/lib/formatters";

type Props = {
  tickets: FastPassTicketRow[];
};

export default function FastPassTicketsTable({ tickets }: Props) {
  if (tickets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay tickets emitidos.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Código</TableHead>
            <TableHead>Titular</TableHead>
            <TableHead>Día</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Compra</TableHead>
            <TableHead>Emitido</TableHead>
            <TableHead>Activado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((ticket) => (
            <TableRow key={ticket.id}>
              <TableCell>{ticket.id}</TableCell>
              <TableCell className="font-mono text-xs">{ticket.code}</TableCell>
              <TableCell>{ticket.holderName ?? "—"}</TableCell>
              <TableCell>{ticket.festivalDateLabel}</TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {FAST_PASS_TICKET_STATUS_LABELS[ticket.status]}
                </Badge>
              </TableCell>
              <TableCell>#{ticket.purchaseId}</TableCell>
              <TableCell>{formatDateWithTime(ticket.issuedAt)}</TableCell>
              <TableCell>
                {ticket.activatedAt
                  ? formatDateWithTime(ticket.activatedAt)
                  : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
