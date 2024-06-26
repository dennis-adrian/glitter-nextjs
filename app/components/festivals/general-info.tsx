import DateBadge from "@/app/components/date-badge";
import { RedirectButton } from "@/app/components/redirect-button";
import { Button } from "@/app/components/ui/button";
import {
  FestivalDate,
  FestivalWithDates,
} from "@/app/data/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";
import { ArrowUpRightIcon, MapPinIcon, TicketIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

function DateLabel({ date }: { date: FestivalDate }) {
  const startDate = formatDate(date.startDate);
  const endDate = formatDate(date.endDate);

  return (
    <div className="flex gap-2 items-center">
      <DateBadge date={startDate} />
      <div className="flex flex-col">
        {startDate.toLocaleString({
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
        <span className="text-muted-foreground text-sm">
          {startDate.toLocaleString({ hour: "numeric", minute: "numeric" })}
          hrs a {endDate.toLocaleString({ hour: "numeric", minute: "numeric" })}
          hrs
        </span>
      </div>
    </div>
  );
}

type GeneralInfoProps = {
  festival: FestivalWithDates;
};

export default function GeneralInfo(props: GeneralInfoProps) {
  const dates = props.festival.festivalDates;
  const isRegistrationOpen =
    props.festival.publicRegistration && !props.festival.eventDayRegistration;

  return (
    <div>
      <div className="flex gap-4 pt-4 md:p-6 justify-start flex-col">
        {props.festival.mascotUrl && (
          <Image
            className="mx-auto flex-grow-0"
            alt="mascota del evento"
            height={545}
            src={props.festival.mascotUrl}
            width={300}
          />
        )}
        <div className="flex flex-wrap gap-4 py-4 flex-grow md:justify-around">
          {dates &&
            dates.length > 0 &&
            dates.map((date) => <DateLabel key={date.id} date={date} />)}
          <div className="flex gap-2 items-center">
            <div className="w-12 h-12 rounded-sm border flex justify-center items-center">
              <MapPinIcon className="w-7 h-7 text-muted-foreground" />
            </div>
            <div className="flex flex-col">
              {props.festival.locationUrl ? (
                <Link
                  className="flex gap-1 hover:underline"
                  href={props.festival.locationUrl}
                  target="_blank"
                >
                  {props.festival.locationLabel}
                  <ArrowUpRightIcon className="h-4 w-4 text-muted-foreground" />
                </Link>
              ) : (
                props.festival.locationLabel
              )}
              <span className="text-muted-foreground text-sm">
                {props.festival.address}
              </span>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <div className="w-12 h-12 rounded-sm border flex justify-center items-center">
              <TicketIcon className="w-7 h-7 text-muted-foreground" />
            </div>
            Entrada libre al evento
          </div>
        </div>
      </div>
      {props.festival.status === "active" && (
        <div className="flex justify-center items-center">
          {isRegistrationOpen ? (
            <RedirectButton
              href={`/festivals/${props.festival.id}/registration`}
            >
              Reservar entrada
            </RedirectButton>
          ) : (
            <div className="flex flex-col gap-2">
              <Button disabled>Reservar entrada</Button>
              <div className="text-muted-foreground text-sm">
                {props.festival.eventDayRegistration ? (
                  <span>Registro habilitado en puerta</span>
                ) : (
                  <span>La reserva de entradas no está habilitada</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {props.festival.generalMapUrl && (
        <div className="py-4">
          <h2 className="font-semibold text-xl mt-4">Distribución General</h2>
          <span className="flex flex-wrap text-muted-foreground text-sm">
            <p className="mr-1">
              Para ven en detalle los participantes y los sectores del evento
              visita{" "}
              <Link
                className="text-primary-400 hover:underline"
                href={`/festivals/${props.festival.id}?tab=sectors`}
              >
                Sectores y participantes
              </Link>
            </p>
          </span>
          <Image
            className="mx-auto my-4"
            alt="mapa del evento"
            height={545}
            src={props.festival.generalMapUrl}
            width={300}
          />
        </div>
      )}
    </div>
  );
}
