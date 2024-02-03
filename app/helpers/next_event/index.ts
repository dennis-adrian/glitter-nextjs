import { Festival } from "@/app/api/festivals/actions";

export function getFestivalDateLabel(festival: Festival) {
  const startDateDay = festival.startDate.getDate() + 1;
  const endDateDay = festival.endDate.getDate() + 1;
  const startDateMonth = festival.startDate.toLocaleString("es-ES", {
    month: "long",
  });

  return `${startDateDay} y ${endDateDay} de ${startDateMonth}`;
}
