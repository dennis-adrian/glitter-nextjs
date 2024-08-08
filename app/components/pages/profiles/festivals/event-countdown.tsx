"use client";

import CopyToClipboardButton from "@/app/components/common/copy-to-clipboard-button";
import { RedirectButton } from "@/app/components/redirect-button";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";
import { RotateCwIcon } from "lucide-react";
import { DateTime } from "luxon";
import { useEffect, useState } from "react";

type EventCountdownProps = {
  festival: FestivalBase;
};
export default function EventCountdown(props: EventCountdownProps) {
  const [timeLeft, setTimeLeft] = useState(3600000);

  useEffect(() => {
    const reservationStartDate = formatDate(
      props.festival.reservationsStartDate,
    );
    const currentTime = DateTime.now();
    const diff = reservationStartDate.diff(currentTime).milliseconds;
    setTimeLeft(diff);

    const interval = setInterval(() => {
      setTimeLeft((prevTimeLeft) => prevTimeLeft - 1000);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const days = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
  const hours = Math.floor((timeLeft / (60 * 60 * 1000)) % 24);
  const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((timeLeft % (60 * 1000)) / 1000);

  return (
    <div className="container flex flex-col items-center justify-center p-4 md:p-6">
      <h1 className="text-center text-xl font-bold md:text-3xl my-4 md:my-8">
        {props.festival.name}
      </h1>
      {timeLeft <= 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-4">
          <h2 className="text-xl font-semibold md:text-3xl">
            Reservas habilitadas
          </h2>
          <p className="text-sm">Recarga la página para hacer tu reserva</p>
          <RedirectButton href={window.location.href}>
            <RotateCwIcon className="w-4 h-4 mr-1" />
            Recargar página
          </RedirectButton>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center text-center gap-2 md:gap-3">
          <span className="text-sm md:text-base">
            Las reseservas se habilitarán el{" "}
            {formatDate(props.festival.reservationsStartDate).toLocaleString(
              DateTime.DATE_HUGE,
            )}{" "}
            a partir de las{" "}
            {formatDate(props.festival.reservationsStartDate).toLocaleString(
              DateTime.TIME_24_SIMPLE,
            )}
          </span>
          <div className="text-5xl lg:text-6xl font-bold text-card-foreground mt-4">
            {days > 0 && <span>{days.toString().padStart(2, "0")}:</span>}
            {hours.toString().padStart(2, "0")}:
            {minutes.toString().padStart(2, "0")}:
            {seconds.toString().padStart(2, "0")}
          </div>
          <div className="flex flex-col items-center justify-center gap-1 md:gap-2">
            <span className="text-sm">
              Copia este enlace y guárdalo si quieres regresar más tarde
            </span>
            <CopyToClipboardButton
              text={window.location.href}
              label="Copiar enlace"
            />
          </div>
        </div>
      )}
    </div>
  );
}
