import { VisitorBase, VisitorWithTickets } from "@/app/api/visitors/actions";
import { formatFullDate } from "@/app/lib/formatters";
import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/components/ui/drawer-dialog";

export default function TicketModal({
  show,
  visitor,
}: {
  show: boolean;
  visitor: VisitorWithTickets;
}) {
  if (visitor.tickets.length < 1) {
    return null;
  }

  return (
    <DrawerDialog open={show}>
      <DrawerDialogContent>
        <DrawerDialogHeader>
          <DrawerDialogTitle>Ticket</DrawerDialogTitle>
        </DrawerDialogHeader>
        <div>
          {visitor.tickets.map((ticket) => (
            <div key={ticket.id}>
              <p>{ticket.id}</p>
              <p>{formatFullDate(ticket.date)}</p>
            </div>
          ))}
        </div>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
