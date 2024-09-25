import { FestivalBase } from "@/app/data/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";
import dynamic from "next/dynamic";

const CopyLinkButtonComponent = dynamic(
  () => import("@/components/pages/profiles/festivals/copy-link-button"),
  { ssr: false },
);

type ReservationNotAllowedProps = {
  festival: FestivalBase;
};

export default function ReservationNotAllowed(
  props: ReservationNotAllowedProps,
) {
  console.log(props.festival.reservationsStartDate);
  console.log(new Date());
  return (
    <div className="container flex flex-col items-center justify-center p-4 md:p-6">
      <h1 className="text-center text-xl font-bold md:text-3xl my-4 md:my-8">
        {props.festival.name}
      </h1>
      {props.festival.reservationsStartDate > new Date() ? (
        <div className="flex flex-col items-center justify-center text-center gap-2 md:gap-3">
          <span className="text-sm md:text-base">
            Las reseservas se habilitarán el{" "}
            {formatDate(props.festival.reservationsStartDate).toLocaleString(
              DateTime.DATE_HUGE,
            )}
          </span>
          <div className="flex flex-col items-center justify-center gap-1 md:gap-2">
            <span className="text-sm">
              Copia este enlace y guárdalo si quieres regresar más tarde
            </span>
          </div>
          <CopyLinkButtonComponent />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center text-center gap-4">
          <h2 className="text-xl font-semibold md:text-3xl">
            Reservas habilitadas recarga la página para hacer tu reserva
          </h2>
        </div>
      )}
    </div>
  );
}
