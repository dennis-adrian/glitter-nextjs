// This methods are meant to be used in both ui and sever

export function getTicketCode(festivalCode: string, ticketNumber: number) {
  const formattedTicketNumber = (ticketNumber || "")
    .toString()
    .padStart(4, "0");

  return `${festivalCode}-${formattedTicketNumber}`;
}
