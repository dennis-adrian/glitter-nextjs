import { FestivalBase } from "@/app/data/festivals/definitions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";

export function getVisitorFestivalTickets(
  visitor: VisitorWithTickets,
  festival: FestivalBase,
) {
  return visitor.tickets.filter((ticket) => ticket.festivalId === festival.id);
}
