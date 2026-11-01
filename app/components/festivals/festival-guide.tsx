import {
  AwardIcon,
  MapIcon,
  MapPinIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

import { Skeleton } from "@/app/components/ui/skeleton";
import { cn } from "@/app/lib/utils";

type GuideCard = {
  key: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  href: string;
  external?: boolean;
};

function plural(count: number, one: string, many: string) {
  return `${count.toLocaleString("es-BO")} ${count === 1 ? one : many}`;
}

/** The cards, each with the live figure of the section it leads to. */
export function buildGuideCards({
  sectorCount,
  standCount,
  participantCount,
  activityNames,
  locationLabel,
  locationUrl,
}: {
  sectorCount: number;
  standCount: number;
  participantCount: number;
  activityNames: string[];
  locationLabel: string | null;
  locationUrl: string | null;
}): GuideCard[] {
  const cards: GuideCard[] = [
    {
      key: "map",
      icon: MapIcon,
      title: "Mapa",
      subtitle:
        sectorCount > 0
          ? `${plural(sectorCount, "sector", "sectores")} · ${plural(standCount, "stand", "stands")}`
          : "Estará disponible pronto",
      href: "#mapa",
    },
    {
      key: "participants",
      icon: UsersIcon,
      title: "Participantes",
      subtitle:
        participantCount > 0
          ? `${participantCount.toLocaleString("es-BO")} · buscá por nombre`
          : "Aún no hay participantes publicados",
      href: "#participantes",
    },
  ];
  if (activityNames.length > 0) {
    cards.push({
      key: "activities",
      icon: AwardIcon,
      title: "Actividades",
      subtitle: activityNames.join(", "),
      href: "#actividades",
    });
  }
  if (locationUrl) {
    cards.push({
      key: "directions",
      icon: MapPinIcon,
      title: "Cómo llegar",
      subtitle: locationLabel ? `${locationLabel} ↗` : "Abrir en el mapa ↗",
      href: locationUrl,
      external: true,
    });
  }
  return cards;
}

/**
 * "Guía del festival": cards that lead to the map, the participants and the
 * activities further down this same page, and out to the venue's location.
 * They take the place of a row of text links; the page itself is unchanged.
 */
export default function FestivalGuide({
  cards,
}: {
  cards: GuideCard[];
}) {
  return (
    <section aria-labelledby="festival-guide-title" className="flex flex-col gap-3">
      <h2
        id="festival-guide-title"
        className="font-display text-lg font-bold text-brand-ink md:text-xl"
      >
        Guía del festival
      </h2>
      <ul
        className={cn(
          "grid grid-cols-2 gap-2 sm:gap-3",
          cards.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
        )}
      >
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <li key={card.key} className="min-w-0">
              <a
                href={card.href}
                {...(card.external
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
                className="flex h-full min-h-24 flex-col gap-1.5 rounded-2xl border border-brand-border bg-brand-card p-3 transition-colors hover:border-brand-primary"
              >
                <Icon className="size-5 text-brand-primary" aria-hidden="true" />
                <span className="text-sm font-semibold text-brand-ink">
                  {card.title}
                </span>
                <span className="line-clamp-2 text-xs text-brand-neutral">
                  {card.subtitle}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The guide's shape while its figures load, the same size as the guide with
 * four cards, so the map below does not move when it arrives.
 */
export function FestivalGuideSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Skeleton className="h-7 w-44" />
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
