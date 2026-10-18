import type { TicketBase } from "@/app/data/tickets/actions";
import type { visitors } from "@/db/schema";

export type NewVisitor = typeof visitors.$inferInsert;
export type VisitorBase = typeof visitors.$inferSelect;
export type VisitorWithTickets = VisitorBase & {
  tickets: TicketBase[];
};
