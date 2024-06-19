import DateBadge from "@/app/components/date-badge";
import {
  FestivalDate,
  FestivalWithDatesAndSectors,
} from "@/app/data/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";
import { ArrowUpRightIcon, MapPinIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

function DateLabel({ date }: { date: FestivalDate }) {
  const startDate = formatDate(date.startDate);
  const endDate = formatDate(date.endDate);

  return (
    <div className="flex gap-2">
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
  festival: FestivalWithDatesAndSectors;
};

export default function GeneralInfo(props: GeneralInfoProps) {
  const dates = props.festival.festivalDates;

  return (
    <div className="flex gap-4 pt-4 md:p-6 sm:justify-center items-start flex-wrap sm:flex-row-reverse">
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
        <div className="flex gap-2">
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
      </div>
    </div>
  );
}
