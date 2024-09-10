import DateBadge from "@/app/components/date-badge";
import {
  FestivalDate,
  FestivalWithDates,
} from "@/app/data/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";
import Image from "next/image";
import { ArrowUpRightIcon, MapPinIcon, TicketIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/app/lib/utils";

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

type GeneralInfoDetailsProps = {
  className?: string;
  festival: FestivalWithDates;
  noMascot?: boolean;
  secondaryTextColor?: string;
  detailsClassName?: string;
};

export default function GeneralInfoDetails(props: GeneralInfoDetailsProps) {
  const dates = props.festival.festivalDates;

  return (
    <div
      className={cn(
        "flex gap-4 pt-4 md:p-6 justify-start flex-col",
        props.className,
      )}
    >
      {props.festival.festivalBannerUrl && !props.noMascot && (
        <div className="relative w-[300px] h-[400px] mx-auto pb-4">
          <Image
            className="object-cover"
            alt="mascota del evento"
            fill
            sizes="(max-width: 768px) 400px, 300px"
            src={props.festival.festivalBannerUrl}
          />
        </div>
      )}
      <div
        className={cn(
          "flex flex-wrap gap-4 pb-4 flex-grow md:justify-around",
          props.detailsClassName,
        )}
      >
        {dates &&
          dates.length > 0 &&
          dates.map((date) => <DateLabel key={date.id} date={date} />)}
        <div className="flex gap-2 items-center">
          <div className="w-12 h-12 bg-white rounded-sm border flex justify-center items-center">
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
          <div className="w-12 h-12 bg-white rounded-sm border flex justify-center items-center">
            <TicketIcon className="w-7 h-7 text-muted-foreground" />
          </div>
          Entrada libre al evento
        </div>
      </div>
    </div>
  );
}
