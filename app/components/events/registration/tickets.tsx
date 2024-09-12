import DownloadableTicket from "@/app/components/events/registration/downloadable-ticket";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { TicketBase } from "@/app/data/tickets/actions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";

type TicketsProps = {
  visitor: VisitorWithTickets;
  tickets: TicketBase[];
  festival: FestivalBase;
};

export default function Tickets(props: TicketsProps) {
  return (
    <div className="flex flex-wrap gap-4 justify-center">
      {props.tickets.map((ticket, index) => (
        <DownloadableTicket
          ticket={ticket}
          key={index}
          visitor={props.visitor}
          festival={props.festival}
        />
      ))}
    </div>
  );
}
