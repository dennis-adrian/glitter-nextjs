import { fetchTicketsByFestival } from "@/app/data/tickets/actions";
import { formatDate } from "@/app/lib/formatters";
import { getTicketCode } from "@/app/lib/tickets/utils";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateTime } from "luxon";

export default async function VerifiedTickets({
  festivalId,
}: {
  festivalId: number;
}) {
  const verifiedTickets = await fetchTicketsByFestival(festivalId);
  const festival = verifiedTickets[0]?.festival;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">
        Lista de Entradas Verificadas
      </h2>
      {verifiedTickets.length === 0 ? (
        <div className="w-full border p-4 h-full rounded-md text-muted-foreground text-center flex justify-center items-center">
          No hay entradas verificadas para este evento
        </div>
      ) : (
        <Table className="border rounded-md">
          <TableCaption>
            Lista de entradas verificadas para el festival.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-fit">Nro. de Ticket</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Fecha de verificación</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {verifiedTickets.map((ticket, index) => (
              <TableRow key={index}>
                <TableCell className="font-medium">
                  {getTicketCode(festival.festivalCode!, ticket.ticketNumber!)}
                </TableCell>
                <TableCell>{`${ticket.visitor?.firstName || ""} ${
                  ticket.visitor?.lastName
                }`}</TableCell>
                <TableCell>
                  {ticket.checkedInAt
                    ? formatDate(ticket.checkedInAt).toLocaleString(
                        DateTime.DATETIME_MED,
                      )
                    : "--"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
