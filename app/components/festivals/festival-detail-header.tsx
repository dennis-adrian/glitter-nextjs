import {
  CalendarDaysIcon,
  ExternalLinkIcon,
  MapPinIcon,
  PencilIcon,
} from "lucide-react";
import Link from "next/link";

import FestivalStatusBadge from "@/app/components/atoms/festival-status-badge";
import FestivalActionsMenu from "@/app/components/festivals/festival-actions-menu";
import { Badge } from "@/app/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/app/components/ui/breadcrumb";
import { Button } from "@/app/components/ui/button";
import type { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { formatFestivalDateRange } from "@/app/lib/festivals/utils";

const FESTIVAL_TYPE_LABELS: Record<FestivalWithDates["festivalType"], string> =
  {
    glitter: "Glitter",
    twinkler: "Twinkler",
    festicker: "Festicker",
  };

/** Where the festival sits, what it is, and the actions on it as a whole. */
export default function FestivalDetailHeader({
  festival,
}: {
  festival: FestivalWithDates;
}) {
  const dateRange = formatFestivalDateRange(festival.festivalDates);
  // The public page only exists once the festival leaves draft.
  const hasPublicPage = festival.status !== "draft";

  return (
    <header className="space-y-3">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard/festivals">Festivales</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="block max-w-[60vw] truncate sm:max-w-md">
              {festival.name}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <FestivalStatusBadge status={festival.status} />
            <Badge variant="outline">
              {FESTIVAL_TYPE_LABELS[festival.festivalType]}
            </Badge>
          </div>
          <h1 className="break-words text-2xl font-bold md:text-3xl">
            {festival.name}
          </h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDaysIcon className="h-4 w-4 shrink-0" aria-hidden />
              {dateRange ?? "Sin fechas"}
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <MapPinIcon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">
                {festival.locationLabel || "Sin ubicación"}
              </span>
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {hasPublicPage ? (
            <Button
              asChild
              variant="outline"
              className="flex-1 md:flex-none"
            >
              <Link
                href={`/festivals/${festival.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLinkIcon className="mr-2 h-4 w-4" aria-hidden />
                Ver página
              </Link>
            </Button>
          ) : null}
          <Button
            asChild
            variant="outline"
            className="flex-1 md:flex-none"
          >
            <Link href={`/dashboard/festivals/${festival.id}/edit`}>
              <PencilIcon className="mr-2 h-4 w-4" aria-hidden />
              Editar
            </Link>
          </Button>
          <FestivalActionsMenu
            festival={festival}
            triggerVariant="outline"
            triggerClassName="shrink-0"
          />
        </div>
      </div>
    </header>
  );
}
