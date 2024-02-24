import { Festival, FestivalBase } from "@/app/api/festivals/definitions";
import { getFestivalDateLabel } from "@/app/helpers/next_event";
import { cn } from "@/app/lib/utils";
import { CalendarIcon, ClockIcon, LocateIcon, LucideIcon } from "lucide-react";

function InfoItem({
  Icon,
  label,
  value,
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex justify-center md:justify-start items-start">
      <span className="py-[6px] flex items-center">
        <Icon className="mr-2 inline-block h-4 w-4" />
      </span>
      <span className="hidden sm:inline-block md:mr-1">{label}</span>
      {value}
    </div>
  );
}

export function FestivalInfo({
  className,
  festival,
}: {
  className?: string;
  festival: Festival | FestivalBase;
}) {
  return (
    <div className={cn("grid gap-2 py-4 text-lg md:text-xl", className)}>
      <InfoItem
        Icon={CalendarIcon}
        label="Fecha: "
        value={getFestivalDateLabel(festival)}
      />
      <InfoItem Icon={ClockIcon} label="Hora: " value="10:00 AM a 7:00 PM" />
      <InfoItem
        Icon={LocateIcon}
        label="Ubicación: "
        value={festival.locationLabel || "Por definir"}
      />
    </div>
  );
}
