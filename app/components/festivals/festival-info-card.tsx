import { ExternalLinkIcon } from "lucide-react";
import { DateTime } from "luxon";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import type { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { sortFestivalDates } from "@/app/lib/festivals/utils";
import { formatDisplayDate } from "@/app/lib/formatters";

function Detail({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {term}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

const DAY: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
};

/** The festival's facts as the public sees them, read-only. */
export default function FestivalInfoCard({
  festival,
}: {
  festival: FestivalWithDates;
}) {
  const dates = sortFestivalDates(festival.festivalDates);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Información</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-4">
          <Detail term="Días y horarios">
            {dates.length === 0 ? (
              <span className="text-muted-foreground">Sin fechas</span>
            ) : (
              <ul className="space-y-0.5">
                {dates.map((date) => (
                  <li key={date.id} className="tabular-nums">
                    <span className="capitalize">
                      {formatDisplayDate(date.startDate, DAY)}
                    </span>
                    <span className="text-muted-foreground">
                      {" · "}
                      {formatDisplayDate(date.startDate, DateTime.TIME_SIMPLE)}
                      {"–"}
                      {formatDisplayDate(date.endDate, DateTime.TIME_SIMPLE)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Detail>

          <Detail term="Lugar">
            <span className="block">
              {festival.locationLabel || (
                <span className="text-muted-foreground">Sin definir</span>
              )}
            </span>
            {festival.address ? (
              <span className="block text-muted-foreground">
                {festival.address}
              </span>
            ) : null}
            {festival.locationUrl ? (
              <a
                href={festival.locationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Ver en el mapa
                <ExternalLinkIcon className="h-3.5 w-3.5" aria-hidden />
              </a>
            ) : null}
          </Detail>

          <Detail term="Inicio de reservas">
            {formatDisplayDate(
              festival.reservationsStartDate,
              DateTime.DATETIME_MED,
            )}
          </Detail>

          {festival.festivalCode ? (
            <Detail term="Código">
              <span className="font-mono">{festival.festivalCode}</span>
            </Detail>
          ) : null}

          <Detail term="Descripción">
            {festival.description ? (
              <span className="whitespace-pre-line">
                {festival.description}
              </span>
            ) : (
              <span className="text-muted-foreground">Sin descripción</span>
            )}
          </Detail>
        </dl>
      </CardContent>
    </Card>
  );
}
