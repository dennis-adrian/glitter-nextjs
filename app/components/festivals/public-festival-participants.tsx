"use client";

import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import type { UserCategory } from "@/app/api/users/definitions";
import ParticipantInfo, {
  type PublicFestivalParticipant,
} from "@/app/components/festivals/participant-info";
import { Input } from "@/app/components/ui/input";
import { cn } from "@/app/lib/utils";
import { getPublicCategoryLabel } from "@/app/lib/maps/helpers";

type CategoryFilter = "all" | UserCategory;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

export default function PublicFestivalParticipants({
  participants,
}: {
  participants: PublicFestivalParticipant[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          participants
            .map((participant) => participant.category)
            .filter((value) => getPublicCategoryLabel(value) != null),
        ),
      ),
    [participants],
  );
  const filteredParticipants = useMemo(() => {
    const normalizedQuery = normalize(query.trim());

    return [...participants]
      .filter((participant) => {
        if (category !== "all" && participant.category !== category) {
          return false;
        }

        if (!normalizedQuery) return true;

        const standLabels = participant.stands
          .map((stand) => `${stand.label ?? ""}${stand.standNumber}`)
          .join(" ");
        const searchable = normalize(
          [
            participant.displayName,
            standLabels,
            getPublicCategoryLabel(participant.category),
          ]
            .filter(Boolean)
            .join(" "),
        );

        return searchable.includes(normalizedQuery);
      })
      .sort((a, b) =>
        (a.displayName || "").localeCompare(b.displayName || "", "es"),
      );
  }, [category, participants, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-sm">
          <span className="sr-only">Buscar participantes</span>
          <SearchIcon
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre o stand"
            className="pl-9"
          />
        </label>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {filteredParticipants.length}{" "}
          {filteredParticipants.length === 1 ? "participante" : "participantes"}
        </p>
      </div>

      {categories.length > 1 ? (
        <div
          role="group"
          className="no-scrollbar flex gap-2 overflow-x-auto pb-1"
          aria-label="Filtrar participantes por categoría"
        >
          <button
            type="button"
            aria-pressed={category === "all"}
            onClick={() => setCategory("all")}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              category === "all"
                ? "border-primary-700 bg-primary-700 text-white"
                : "bg-background hover:border-primary-300 hover:text-primary-700",
            )}
          >
            Todos
          </button>
          {categories.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
              className={cn(
                "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                category === value
                  ? "border-primary-700 bg-primary-700 text-white"
                  : "bg-background hover:border-primary-300 hover:text-primary-700",
              )}
            >
              {getPublicCategoryLabel(value)}
            </button>
          ))}
        </div>
      ) : null}

      {filteredParticipants.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filteredParticipants.map((participant) => (
            <ParticipantInfo key={participant.id} profile={participant} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed px-6 py-12 text-center">
          <p className="font-semibold">No encontramos coincidencias.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Probá otro nombre, número de stand o categoría.
          </p>
        </div>
      )}
    </div>
  );
}
