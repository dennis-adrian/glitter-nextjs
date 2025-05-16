import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { FestivalBase } from "@/app/lib/festivals/definitions";

export function getVisitorFestivalTickets(
  visitor: VisitorWithTickets,
  festival: FestivalBase,
) {
  const festivalTickets = visitor.tickets.filter(
    (ticket) => ticket.festivalId === festival.id,
  );
  return festivalTickets.sort((a, b) => b.date.getTime() - a.date.getTime());
}
