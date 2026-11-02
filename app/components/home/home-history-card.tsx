import Image from "next/image";

import { HubSection } from "@/app/components/participations/hub/hub-section";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/app/components/ui/avatar-radix";
import { formatDisplayDate } from "@/app/lib/formatters";
import type { HistoryFestival, HistorySummary } from "@/app/lib/home/history";
import { cn } from "@/app/lib/utils";

const PARTNERS_SHOWN = 6;

function FestivalRow({
  label,
  festival,
}: {
  label: string;
  festival: HistoryFestival;
}) {
  const when = festival.startDate
    ? formatDisplayDate(festival.startDate, { month: "short", year: "numeric" })
    : null;

  return (
    <div className="flex items-center gap-3">
      <span className="relative block aspect-3/4 w-12 shrink-0 overflow-hidden rounded-lg bg-brand-lavender/40 shadow-sm">
        {festival.posterUrl ? (
          <Image
            src={festival.posterUrl}
            alt=""
            fill
            sizes="48px"
            className="object-cover"
          />
        ) : null}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-xs text-brand-neutral">{label}</span>
        <span className="truncate font-display text-lg font-bold leading-tight text-brand-ink">
          {festival.name}
        </span>
        <span className="text-xs text-brand-neutral">
          {[when, `Stand ${festival.standLabel}`].filter(Boolean).join(" · ")}
        </span>
      </span>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-brand-neutral">{children}</span>;
}

/**
 * The participant's history in one card: first and last festival with their
 * posters, how many festivals, the stands, and who shared them. Without a
 * past participation, a placeholder.
 */
export default function HomeHistoryCard({
  summary,
  wide = false,
}: {
  summary: HistorySummary | null;
  /** Two columns, where the card has the room. */
  wide?: boolean;
}) {
  if (!summary) {
    return (
      <HubSection title="Tu historial">
        <div className="rounded-2xl border border-dashed border-brand-lavender p-4 text-center text-sm text-brand-neutral">
          Cuando participes en tu primer festival, acá vas a ver tu historial.
        </div>
      </HubSection>
    );
  }

  const { first, last, festivalCount, streak, stands, partners } = summary;
  const shownPartners = partners.slice(0, PARTNERS_SHOWN);
  const morePartners = partners.length - shownPartners.length;

  return (
    <HubSection
      title="Tu historial"
      action={{ label: "Ver todo", href: "/my_history" }}
    >
      <div
        className={cn(
          "grid gap-4 rounded-2xl border border-brand-border bg-brand-card p-4",
          wide && "md:grid-cols-2 md:gap-6",
        )}
      >
        <div className="flex flex-col gap-3">
          {last ? (
            <>
              <FestivalRow label="Tu primer festival" festival={first} />
              <FestivalRow label="Tu último festival" festival={last} />
            </>
          ) : (
            <FestivalRow
              label="Tu única participación, por ahora"
              festival={first}
            />
          )}
        </div>

        <div
          className={cn(
            "flex flex-col gap-4 border-t border-brand-border pt-4",
            wide && "md:border-l md:border-t-0 md:pl-6 md:pt-0",
          )}
        >
          <div className="flex flex-col">
            <Label>Festivales en los que participaste</Label>
            <span className="flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold text-brand-ink">
                {festivalCount}
              </span>
              {streak ? (
                <span className="text-sm text-brand-neutral">
                  {streak} ediciones seguidas
                </span>
              ) : null}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>
              {stands.length === 1 ? "Stand que ocupaste" : "Stands que ocupaste"}
            </Label>
            <ul className="flex flex-wrap gap-1.5">
              {stands.map((stand) => (
                <li
                  key={stand}
                  className="rounded-full border border-brand-border px-2.5 py-0.5 text-xs font-semibold text-brand-ink"
                >
                  {stand}
                </li>
              ))}
            </ul>
          </div>

          {shownPartners.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Label>Compartiste stand con</Label>
              <ul className="flex flex-wrap gap-3">
                {shownPartners.map((partner) => (
                  <li
                    key={partner.id}
                    className="flex w-16 flex-col items-center gap-1 text-center"
                  >
                    <Avatar className="size-11 border-2 border-brand-card shadow-sm">
                      <AvatarImage alt="" src={partner.imageUrl || ""} />
                      <AvatarFallback>
                        {(partner.displayName ?? "?").slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="line-clamp-2 text-xs leading-tight text-brand-ink">
                      {partner.displayName ?? "Participante"}
                    </span>
                  </li>
                ))}
                {morePartners > 0 ? (
                  <li className="flex size-11 items-center justify-center rounded-full bg-brand-lavender/60 text-xs font-semibold text-brand-ink">
                    +{morePartners}
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </HubSection>
  );
}
