import { formatDate, formatDisplayDate } from "@/app/lib/formatters";
import { Separator } from "@/app/components/ui/separator";
import { DateTime } from "luxon";
import ReactBarcode from "@/app/(routes)/festivals/[id]/registration/barcode";
import Image from "next/image";
import type {
  TicketFestivalView,
  VisitorTicketView,
} from "@/app/lib/visitors/registration-definitions";

type TicketProps = {
  ticketRef?: React.RefObject<HTMLDivElement | null>;
  ticket: VisitorTicketView;
  /** As printed on the ticket: first name and last initial. */
  holderName: string;
  festival: TicketFestivalView;
};
export default function Ticket({
  ticketRef,
  ticket,
  holderName,
  festival,
}: TicketProps) {
  const date = formatDate(ticket.date);
  const numberOfCompanions = ticket.numberOfVisitors - 1;

  return (
    <div
      className="bg-white border p-4 text-center rounded-sm min-w-72 max-w-80 shadow-md"
      ref={ticketRef}
    >
      <div className="mb-2">
        {festival.mascotUrl && (
          <div className="relative w-full h-full aspect-3/4">
            <Image
              className="mx-auto"
              alt="mascota del festival"
              src={festival.mascotUrl}
              fill
              sizes="(max-width: 768px) 100vw, 512px"
            />
          </div>
        )}
      </div>
      <h1 className="text-lg font-medium leading-5">{festival.name}</h1>
      <Separator className="my-2" />
      <div className="grid grid-cols-2 items-start py-4">
        <div className="flex flex-col text-left">
          <span className="font-semibold text-2xl leading-6">
            {holderName}
          </span>
          {numberOfCompanions > 0 && (
            <span className="text-muted-foreground text-sm">
              +{numberOfCompanions} acompañante(s)
            </span>
          )}
        </div>
        <div className="text-muted-foreground text-sm flex flex-col text-right">
          <span className="text-lg text-foreground">
            {formatDisplayDate(date, DateTime.DATE_MED)}
          </span>
          <span>{festival.locationLabel}</span>
          <span>{festival.address}</span>
        </div>
      </div>
      <Separator className="my-2" />
      <div className="w-fit mx-auto">
        <ReactBarcode className="w-full" value={ticket.code} />
      </div>
    </div>
  );
}
