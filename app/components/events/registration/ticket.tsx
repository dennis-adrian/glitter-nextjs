import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { formatDate } from "@/app/lib/formatters";
import { TicketBase } from "@/app/data/tickets/actions";
import { Separator } from "@/app/components/ui/separator";
import { DateTime } from "luxon";
import ReactBarcode from "@/app/(routes)/festivals/[id]/registration/barcode";
import Image from "next/image";
import { getTicketCode } from "@/app/lib/tickets/utils";
import { FestivalBase } from "@/app/lib/festivals/definitions";

type TicketProps = {
  ticketRef?: React.RefObject<HTMLDivElement | null>;
  ticket: TicketBase;
  visitor: VisitorWithTickets;
  festival: FestivalBase;
};
export default function Ticket(props: TicketProps) {
  const fullName = `${props.visitor.firstName || ""} ${
    props.visitor.lastName || ""
  }`;
  const date = formatDate(props.ticket.date);
  const numberOfCompanions = props.ticket.numberOfVisitors - 1;

  return (
    <div
      className="bg-white border p-4 text-center rounded-sm min-w-72 max-w-80 shadow-md"
      ref={props.ticketRef}
    >
      <div className="mb-2">
        {props.festival.mascotUrl && (
          <Image
            className="mx-auto"
            alt="mascota max el caiman"
            src={props.festival.mascotUrl}
            height={209}
            width={150}
          />
        )}
      </div>
      <h1 className="text-lg font-medium leading-5">{props.festival.name}</h1>
      <Separator className="my-2" />
      <div className="grid grid-cols-2 items-start py-4">
        <div className="flex flex-col text-left">
          <span className="font-semibold text-2xl leading-6">{fullName}</span>
          {numberOfCompanions > 0 && (
            <span className="text-muted-foreground text-sm">
              +{numberOfCompanions} acompañante(s)
            </span>
          )}
        </div>
        <div className="text-muted-foreground text-sm flex flex-col text-right">
          <span className="text-lg text-foreground">
            {date.toLocaleString(DateTime.DATE_MED)}
          </span>
          <span>{props.festival.locationLabel}</span>
          <span>{props.festival.address}</span>
        </div>
      </div>
      <Separator className="my-2" />
      <div className="w-fit mx-auto">
        <ReactBarcode
          className="w-full"
          value={getTicketCode(
            props.festival.festivalCode || "",
            props.ticket.ticketNumber || 0,
          )}
        />
      </div>
    </div>
  );
}
