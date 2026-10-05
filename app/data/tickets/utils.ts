import type { PublicVisitor } from "@/app/data/visitors/actions";
import { TicketBase } from "@/app/data/tickets/actions";
import { formatDate } from "@/app/lib/formatters";

export function hasTicketForTheDay(visitor: Pick<PublicVisitor, "tickets">) {
  return visitor.tickets.some((ticket) => {
    return isTicketForToday(ticket);
  });
}

export function isTicketForToday(ticket: TicketBase) {
  const today = formatDate(new Date());
  const ticketDate = formatDate(ticket.date);
  return today.toLocaleString() === ticketDate.toLocaleString();
}
