import { MutableRefObject } from "react";

import Image from "next/image";

import { CalendarDaysIcon, ClockIcon } from "lucide-react";

import { FestivalBase } from "@/app/data/festivals/definitions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { formatFullDate, getWeekdayFromDate } from "@/app/lib/formatters";
import { junegull } from "@/app/ui/fonts";

export default function Ticket({
  festival,
  ticketRef,
  visitor,
  onQrLoad,
}: {
  festival: FestivalBase;
  ticketRef?: MutableRefObject<null>;
  visitor: VisitorWithTickets;
  onQrLoad?: () => void;
}) {
  return (
    <div
      ref={ticketRef}
      className="flex flex-col items-center rounded-lg bg-gradient-to-b from-[#FF9458] via-[#FF6A96] to-[#9D70FF] p-6 pb-0 md:p-8 md:pb-0"
    >
      <Image
        alt="Logo de Glitter con descripción"
        src="https://utfs.io/f/e6820207-3eb1-43fd-b140-d00184fd8182-e81rey.png"
        height={56}
        width={170}
      />
      <div className="m-2 flex h-60 w-60 items-center justify-center rounded-lg bg-white/50 backdrop-blur-sm">
        <Image
          onLoad={onQrLoad}
          className="rounded-lg"
          alt="Logo de Glitter"
          src={visitor.tickets[0].qrcode}
          height={204}
          width={204}
        />
      </div>
      <h1
        className={`${junegull.className} text-shadow text-5xl text-white shadow-blue-950 sm:text-6xl`}
      >
        Entrada
      </h1>
      <div className="my-3 rounded-2xl bg-[#44161E] px-3 py-1 font-semibold uppercase text-white">
        {visitor.tickets.length > 1 ? (
          <h3>
            {getWeekdayFromDate(visitor.tickets[0].date)} y{" "}
            {getWeekdayFromDate(visitor.tickets[1].date)}
          </h3>
        ) : (
          <h3>Día {getWeekdayFromDate(visitor.tickets[0].date)}</h3>
        )}
      </div>
      <div className="text-center text-lg leading-5 tracking-tight text-white">
        <p>
          Esta entrada es válida sólo para 1 persona y debe de ser mostrada al
          momento de ingresar al evento
        </p>
        {visitor.tickets.length > 1 && (
          <p className="mt-2">
            Presentar esta misma entrada ambos días que asistas
          </p>
        )}
      </div>
      <div className="text-primary-foreground my-3">
        {visitor.tickets.map((ticket) => (
          <div className="flex items-center" key={ticket.id}>
            <span className="flex items-center">
              <CalendarDaysIcon className="mr-1 h-4 w-4" />
              <span>{formatFullDate(ticket.date)}</span>
            </span>
            <span className="flex items-center">
              <ClockIcon className="ml-3 mr-1 h-4 w-4" />
              <span>10:00-18:00</span>
            </span>
          </div>
        ))}
      </div>
      <div className="mb-3 flex items-center justify-center rounded-lg bg-white/20 text-white px-4 py-2 text-sm backdrop-blur-lg">
        {festival.locationLabel} - {festival.address}
      </div>
      <Image
        alt="footer image"
        src={
          "https://utfs.io/f/4d8ce376-781d-4b60-8d49-0e85d28ddb06-67dtvs.png" ||
          "/img/samy-head.png"
        }
        height={132}
        width={320}
      />
    </div>
  );
}
