import { Festival } from "@/app/api/festivals/definitions";
import { getFestivalDateLabel } from "@/app/helpers/next_event";
import { CalendarIcon, ClockIcon, LocateIcon } from "lucide-react";

export function FestivalInfo({ festival }: { festival: Festival }) {
  return (
    <div className="grid gap-2 py-4 text-lg md:text-xl">
      <div className="flex items-center justify-center md:justify-start">
        <CalendarIcon className="mr-2 inline-block h-4 w-4" />
        <span className="hidden md:inline-block md:mr-1">Fecha: </span>
        {getFestivalDateLabel(festival)}
      </div>
      <div className="flex items-center justify-center md:justify-start">
        <ClockIcon className="mr-2 inline-block h-4 w-4" />
        <span className="hidden md:inline-block md:mr-1">Hora: </span>
        10:00 AM a 7:00 PM
      </div>
      <div className="flex items-center justify-center md:justify-start">
        <LocateIcon className="mr-2 inline-block h-4 w-4" />
        <span className="hidden md:inline-block md:mr-1">Ubicación:</span>
        {festival.locationLabel}
      </div>
    </div>
  );
}
