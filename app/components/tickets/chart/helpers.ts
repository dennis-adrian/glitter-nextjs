import { TicketWithVisitor } from "@/app/data/tickets/actions";
import { formatDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";

export const generateChartData = (tickets: TicketWithVisitor[]) => {
  const chartData = [] as { date: string; tickets: number }[];
  const orderedTickets = tickets.sort((a, b) => {
    return a.createdAt.valueOf() - b.createdAt.valueOf();
  });
  const ticketsByHour = orderedTickets.reduce((acc, ticket) => {
    const date = formatDate(ticket.createdAt)
      .startOf("hour")
      .toFormat("dd/MM HH'h'");

    if (!acc[date]) {
      acc[date] = 0;
    }

    acc[date] += ticket.numberOfVisitors;
    return acc;
  }, {} as Record<string, number>);

  Object.keys(ticketsByHour).forEach((date) => {
    debugger;
    DateTime.fromFormat;
    chartData.push({
      date,
      tickets: ticketsByHour[date],
    });
  });

  return chartData;
};
