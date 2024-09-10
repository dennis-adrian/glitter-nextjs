import { FestivalBase } from "@/app/data/festivals/definitions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";

export function getVisitorFestivalTickets(
  visitor: VisitorWithTickets,
  festival: FestivalBase,
) {
  const festivalTickets = visitor.tickets.filter(
    (ticket) => ticket.festivalId === festival.id,
  );
  return festivalTickets.sort((a, b) => b.date.getTime() - a.date.getTime());
}
