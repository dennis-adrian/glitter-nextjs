import { getFestivalDateLabel } from "@/app/helpers/next_event";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { cn } from "@/app/lib/utils";
import {
  BuildingIcon,
  CalendarIcon,
  LucideIcon,
  MapPinIcon,
} from "lucide-react";

function InfoItem({
  className,
  Icon,
  value,
}: {
  className?: string;
  Icon: LucideIcon;
  value: string;
}) {
  return (
    <div
      className={cn(
        "flex text-base justify-center md:justify-start items-center md:items-start",
        className,
      )}
    >
      <div className="flex items-center justify-center md:justify-start">
        <Icon className="mr-2 h-4 w-4" />
      </div>
      <span className="text-left">{value}</span>
    </div>
  );
}

export function FestivalInfo({
  className,
  festival,
}: {
  center?: boolean;
  className?: string;
  festival: FestivalWithDates;
}) {
  return (
    <div
      className={cn("grid gap-1 py-4 text-lg md:gap-2 md:text-xl", className)}
    >
      <InfoItem
        className="capitalize"
        Icon={CalendarIcon}
        value={getFestivalDateLabel(festival)}
      />
      <InfoItem
        Icon={BuildingIcon}
        value={festival.locationLabel || "Por definir"}
      />
      <InfoItem Icon={MapPinIcon} value={festival.address || "Por definir"} />
    </div>
  );
}
