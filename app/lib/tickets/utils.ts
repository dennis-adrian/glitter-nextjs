// This methods are meant to be used in both ui and sever

import { FestivalBase } from "@/app/data/festivals/definitions";
import { TicketBase } from "@/app/data/tickets/actions";

export function getTicketCode(festivalCode: string, ticketNumber: number) {
  const formattedTicketNumber = (ticketNumber || "")
    .toString()
    .padStart(4, "0");

  return `${festivalCode}-${formattedTicketNumber}`;
}
