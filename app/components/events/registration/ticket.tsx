import { FestivalBase } from "@/app/data/festivals/definitions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { formatDate } from "@/app/lib/formatters";
import { TicketBase } from "@/app/data/tickets/actions";
import { Separator } from "@/app/components/ui/separator";
import { DateTime } from "luxon";
import ReactBarcode from "@/app/(routes)/festivals/[id]/registration/barcode";

type TicketProps = {
  ticket: TicketBase;
  visitor: VisitorWithTickets;
  festival: FestivalBase;
};
export default function Ticket(props: TicketProps) {
  const fullName = `${props.visitor.firstName || ""} ${
    props.visitor.lastName || ""
  }`;
  const date = formatDate(props.ticket.date);

  return (
    <div className="border p-4 text-center">
      <div className="h-20"></div>
      <h1>{props.festival.name}</h1>
      <Separator className="my-2" />
      <div className="grid grid-cols-2 items-center py-4">
        <div className="flex flex-col text-left">
          <span className="font-semibold text-3xl leading-6">{fullName}</span>
          <span className="text-muted-foreground text-sm">+1 person</span>
        </div>
        <div className="text-muted-foreground text-sm flex flex-col text-right">
          <span>{date.toLocaleString(DateTime.DATE_MED)}</span>
          <span>{props.festival.locationLabel}</span>
          <span>{props.festival.address}</span>
        </div>
      </div>
      <Separator className="my-2" />
      <div className="w-fit mx-auto">
        <ReactBarcode value={`GLT05${props.ticket.ticketNumber}`} />
      </div>
    </div>
  );
}
