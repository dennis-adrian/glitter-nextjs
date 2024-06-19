import DateBadge from "@/app/components/date-badge";
import {
  FestivalDate,
  FestivalWithDatesAndSectors,
} from "@/app/data/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";
import Image from "next/image";

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
    <div className="flex gap-4 sm:justify-center items-start flex-wrap sm:flex-row-reverse">
      {props.festival.mascotUrl && (
        <Image
          className="mx-auto"
          alt="mascota del evento"
          height={545}
          src={props.festival.mascotUrl}
          width={300}
        />
      )}
      {dates && dates.length > 0 && (
        <div className="flex flex-wrap gap-4 py-4">
          {dates.map((date) => (
            <DateLabel key={date.id} date={date} />
          ))}
        </div>
      )}
    </div>
  );
}
