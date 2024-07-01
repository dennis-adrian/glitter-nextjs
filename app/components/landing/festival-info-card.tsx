import { FestivalWithDates } from "@/app/data/festivals/definitions";
import { getFestivalDateLabel } from "@/app/helpers/next_event";
import { cn } from "@/app/lib/utils";
import {
  BuildingIcon,
  CalendarIcon,
  LucideIcon,
  MapPinIcon,
} from "lucide-react";

function InfoItem({ Icon, value }: { Icon: LucideIcon; value: string }) {
  return (
    <div className="flex text-base justify-center md:justify-start items-center md:items-start">
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
      <InfoItem Icon={CalendarIcon} value={getFestivalDateLabel(festival)} />
      <InfoItem
        Icon={BuildingIcon}
        value={festival.locationLabel || "Por definir"}
      />
      <InfoItem Icon={MapPinIcon} value={festival.address || "Por definir"} />
    </div>
  );
}
