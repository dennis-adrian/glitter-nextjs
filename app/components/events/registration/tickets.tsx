import DownloadableTicket from "@/app/components/events/registration/downloadable-ticket";
import type {
  TicketFestivalView,
  VisitorTicketView,
} from "@/app/lib/visitors/registration-definitions";

type TicketsProps = {
  tickets: VisitorTicketView[];
  holderName: string;
  festival: TicketFestivalView;
};

export default function Tickets(props: TicketsProps) {
  return (
    <div className="flex flex-wrap gap-4 justify-center animate-slide-up">
      {props.tickets.map((ticket) => (
        <DownloadableTicket
          ticket={ticket}
          key={ticket.id}
          holderName={props.holderName}
          festival={props.festival}
        />
      ))}
    </div>
  );
}
