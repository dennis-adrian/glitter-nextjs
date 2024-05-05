import { Festival, FestivalBase } from "@/app/data/festivals/definitions";
import { getFestivalDateLabel } from "@/app/helpers/next_event";
import { cn } from "@/app/lib/utils";
import {
  BuildingIcon,
  CalendarIcon,
  ClockIcon,
  LocateIcon,
  LucideIcon,
  MapPinIcon,
} from "lucide-react";

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
    <div className="flex text-base justify-center md:justify-start items-center md:items-start">
      <div className="flex items-center justify-center md:justify-start">
        <Icon className="mr-2 h-4 w-4" />
        <span className="hidden sm:inline-block md:mr-1">{label}</span>
      </div>
      <span className="text-left">{value}</span>
    </div>
  );
}

export function FestivalInfo({
  className,
  festival,
  center,
}: {
  center?: boolean;
  className?: string;
  festival: Festival | FestivalBase;
}) {
  return (
    <div
      className={cn("grid gap-1 py-4 text-lg md:gap-2 md:text-xl", className)}
    >
      <InfoItem
        Icon={CalendarIcon}
        label="Fecha: "
        value={getFestivalDateLabel(festival)}
      />
      <InfoItem Icon={ClockIcon} label="Hora: " value="10:00 AM a 6:00 PM" />
      <InfoItem
        Icon={BuildingIcon}
        label="Lugar: "
        value={festival.locationLabel || "Por definir"}
      />
      <InfoItem
        Icon={MapPinIcon}
        label="Dirección: "
        value={festival.address || "Por definir"}
      />
    </div>
  );
}
