import DateBadge from "@/app/components/date-badge";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";
import Image from "next/image";

function DateLabel({
  startDate,
  endDate,
}: {
  startDate: DateTime;
  endDate: DateTime;
}) {
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
  festival: FestivalBase;
};

export default function GeneralInfo(props: GeneralInfoProps) {
  const startDate = formatDate(props.festival.startDate);
  const endDate = formatDate(props.festival.endDate);

  return (
    <div className="grid gap-2 py-4">
      {props.festival.mascotUrl && (
        <Image
          className="mx-auto"
          alt="mascota del evento"
          height={545}
          src={props.festival.mascotUrl}
          width={429}
        />
      )}
      {startDate && <DateLabel startDate={startDate} endDate={endDate} />}
      {endDate && !endDate.equals(startDate) && (
        <DateLabel startDate={endDate} endDate={endDate} />
      )}
    </div>
  );
}
