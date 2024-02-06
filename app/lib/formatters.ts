export function formatFullDate(date: Date): string {
  const dateFormatter = new Intl.DateTimeFormat("es-Es", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const currentDate = new Date();

  return dateFormatter.format(currentDate);
}
