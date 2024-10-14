import { BuildingIcon, CalendarDaysIcon, MapPinIcon } from "lucide-react";

import FestivalStatusBadge from "@/components/festivals/festival-status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import FestivalSwitches from "./festival-switches";
import { RedirectButton } from "@/app/components/redirect-button";
import ArchiveFestival from "@/app/components/festivals/archive-festival";
import { formatDate } from "@/app/lib/formatters";

export default function FestivalCard({
  festival,
}: {
  festival: FestivalWithDates;
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex gap-2 items-start">
            <CardTitle>{festival.name}</CardTitle>
            <FestivalStatusBadge status={festival.status} />
          </div>
          <CardDescription>
            {festival.description || "No definido"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-end">
            <RedirectButton
              variant="link"
              href={`/dashboard/festivals/${festival.id}/tickets`}
            >
              Ver visitantes
            </RedirectButton>
            <RedirectButton
              variant="link"
              href={`/dashboard/festivals/${festival.id}/participants`}
            >
              Ver participantes
            </RedirectButton>
          </div>
          <FestivalSwitches festival={festival} />
          <div className="p-4 border rounded-lg space-y-3">
            <h3 className="font-semibold text-xl">Detalles</h3>
            <div>
              {festival.festivalDates.map((date) => (
                <span className="flex gap-2 items-center" key={date.id}>
                  <CalendarDaysIcon className="w-5 h-5" />{" "}
                  {formatDate(date.startDate).toLocaleString({
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              ))}
              <span className="flex gap-2 items-center">
                <BuildingIcon className="w-5 h-5" />{" "}
                {festival.locationLabel || "No definido"}
              </span>
              <span className="flex gap-2 items-center">
                <MapPinIcon className="w-5 h-5" />{" "}
                {festival.address || "No definido"}
              </span>
            </div>
          </div>
          <ArchiveFestival festival={festival} />
        </CardContent>
      </Card>
    </>
  );
}
