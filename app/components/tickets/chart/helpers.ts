import { TicketWithVisitor } from "@/app/data/tickets/actions";
import { formatDate } from "@/app/lib/formatters";

export type ChartDataPoint = {
  hour: string;
  day1: number;
  day2?: number;
};

export const generateChartData = (
  tickets: TicketWithVisitor[],
  festivalDates: { startDate: Date }[],
): ChartDataPoint[] => {
  const checkedInTickets = tickets.filter((t) => t.checkedInAt);

  if (festivalDates.length < 2) {
    const byHour: Record<string, number> = {};
    for (const ticket of checkedInTickets) {
      const hour = formatDate(ticket.checkedInAt!)
        .startOf("hour")
        .toFormat("HH'h'");
      byHour[hour] = (byHour[hour] || 0) + ticket.numberOfVisitors;
    }
    return Object.entries(byHour)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, day1]) => ({ hour, day1 }));
  }

  const day1Date = formatDate(festivalDates[0].startDate).toISODate();
  const day2Date = formatDate(festivalDates[1].startDate).toISODate();

  const allHours = new Set<string>();
  const day1ByHour: Record<string, number> = {};
  const day2ByHour: Record<string, number> = {};

  for (const ticket of checkedInTickets) {
    const dt = formatDate(ticket.checkedInAt!);
    const hour = dt.startOf("hour").toFormat("HH'h'");
    const ticketDate = dt.toISODate();

    allHours.add(hour);

    if (ticketDate === day1Date) {
      day1ByHour[hour] = (day1ByHour[hour] || 0) + ticket.numberOfVisitors;
    } else if (ticketDate === day2Date) {
      day2ByHour[hour] = (day2ByHour[hour] || 0) + ticket.numberOfVisitors;
    }
  }

  return Array.from(allHours)
    .sort()
    .map((hour) => ({
      hour,
      day1: day1ByHour[hour] || 0,
      day2: day2ByHour[hour] || 0,
    }));
};
