export function formatFullDate(date: Date): string {
  const dateFormatter = new Intl.DateTimeFormat("es-Es", {
    timeZone: "Etc/GMT",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  date = date || new Date();

  return dateFormatter.format(date);
}

export function getWeekdayFromDate(
  date: Date,
  format: "long" | "short" | "narrow" = "long",
): string {
  const dateFormatter = new Intl.DateTimeFormat("es-Es", {
    timeZone: "Etc/GMT",
    weekday: format,
  });
  date = date || new Date();

  return dateFormatter.format(date);
}
