import { TicketWithVisitor } from "@/app/data/tickets/actions";
import { formatDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";

export const generateChartData = (tickets: TicketWithVisitor[]) => {
  const chartData = [] as { date: string; tickets: number }[];
  const orderedTickets = tickets.sort((a, b) => {
    if (!a.checkedInAt || !b.checkedInAt) return -1;
    return a.checkedInAt.valueOf() - b.checkedInAt.valueOf();
  });
  const ticketsByHour = orderedTickets.reduce((acc, ticket) => {
    if (!ticket.checkedInAt) return acc;
    const date = formatDate(ticket.checkedInAt)
      .startOf("hour")
      .toFormat("dd/MM HH'h'");

    if (!acc[date]) {
      acc[date] = 0;
    }

    acc[date] += ticket.numberOfVisitors;
    return acc;
  }, {} as Record<string, number>);

  Object.keys(ticketsByHour).forEach((date) => {
    DateTime.fromFormat;
    chartData.push({
      date,
      tickets: ticketsByHour[date],
    });
  });

  return chartData;
};
