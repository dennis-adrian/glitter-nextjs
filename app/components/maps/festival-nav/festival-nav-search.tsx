"use client";

import { useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import {
  normalizeParticipantSearch,
  rankParticipantSearchEntries,
  type ParticipantSearchEntry,
} from "@/app/components/maps/festival-nav/festival-nav-participant-search";
import { cn } from "@/app/lib/utils";

/**
 * One panel's worth. On a phone the dropdown is a ~240px window, so rendering
 * every match filled it with a list nobody could scan — a single letter matches
 * most of the festival.
 */
const MAX_RESULTS = 8;

type FestivalNavSearchProps = {
  entries: ParticipantSearchEntry[];
  onSelect: (entry: ParticipantSearchEntry) => void;
  value?: string;
  onValueChange?: (value: string) => void;
  flush?: boolean;
  /** Sector on screen, so an empty query can suggest who is in it. -1 is all. */
  activeSectorIndex?: number;
};

export default function FestivalNavSearch({
  entries,
  onSelect,
  value,
  onValueChange,
  flush = false,
  activeSectorIndex,
}: FestivalNavSearchProps) {
  const [internalQuery, setInternalQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const query = value ?? internalQuery;

  function setQuery(nextValue: string) {
    if (value === undefined) setInternalQuery(nextValue);
    onValueChange?.(nextValue);
  }

  const normalized = normalizeParticipantSearch(query.trim());
  const isSearching = normalized.length > 0;
  const matches = isSearching
    ? rankParticipantSearchEntries(entries, query)
    : [];
  // With no query the panel still has a job. Opening onto nothing reads as a
  // broken field, so it offers the sector the visitor is already looking at.
  const scopedToSector = activeSectorIndex != null && activeSectorIndex >= 0;
  const suggestions = isSearching
    ? []
    : scopedToSector
      ? entries.filter((entry) => entry.sectorIndex === activeSectorIndex)
      : entries;
  const visible = (isSearching ? matches : suggestions).slice(0, MAX_RESULTS);
  const hiddenMatches = isSearching ? matches.length - visible.length : 0;

  function handleSelect(entry: ParticipantSearchEntry) {
    setQuery("");
    setOpen(false);
    onSelect(entry);
  }

  function handleClear() {
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }

  /**
   * Focusing the field lifts the controls bar to where it sticks, so the
   * results open into the screen above the mobile keyboard rather than the
   * strip left between the field and it.
   *
   * The bar is the parent's, not this component's, so it is found by its
   * `position` rather than passed in — both callers wrap the field in one.
   */
  function scrollFieldIntoPlace() {
    const input = inputRef.current;
    if (!input) return;

    let sticky = input.parentElement;
    while (sticky && window.getComputedStyle(sticky).position !== "sticky") {
      sticky = sticky.parentElement;
    }
    if (!sticky) return;

    // Where the field lands once the bar is pinned: the bar's own offset, plus
    // however far into the bar the field sits.
    const stickyTop = Number.parseFloat(window.getComputedStyle(sticky).top);
    const fieldTop = input.getBoundingClientRect().top;
    const restingTop =
      (Number.isNaN(stickyTop) ? 0 : stickyTop) +
      (fieldTop - sticky.getBoundingClientRect().top);
    const distance = fieldTop - restingTop;

    // Already pinned: the bar has nowhere higher to go, so leave the scroll be.
    if (distance <= 1) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    window.scrollBy({
      top: distance,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

  function handleWrapperBlur(event: React.FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget as Node | null;
    if (!nextTarget || !wrapperRef.current?.contains(nextTarget)) {
      setOpen(false);
    }
  }

  return (
    <div
      ref={wrapperRef}
      onBlur={handleWrapperBlur}
      className={cn("relative shrink-0 py-2", !flush && "px-4")}
    >
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          aria-label="Buscar participantes"
          placeholder="Buscar participante..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            scrollFieldIntoPlace();
          }}
          className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-10 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {query.length > 0 ? (
          <button
            type="button"
            aria-label="Limpiar búsqueda"
            title="Limpiar búsqueda"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleClear}
            className="absolute right-2 flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {open && visible.length > 0 && (
        <ul
          className={cn(
            "absolute top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-background shadow-lg",
            flush ? "left-0 right-0" : "left-4 right-4",
          )}
        >
          {!isSearching ? (
            <li className="sticky top-0 border-b bg-background px-3 py-2 text-xs font-medium text-muted-foreground">
              {scopedToSector && visible[0]
                ? `Participantes en ${visible[0].sectorName}`
                : "Participantes del festival"}
            </li>
          ) : null}
          {visible.map((entry, i) => (
            <li key={`${entry.stand.id}-${i}`}>
              <button
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted transition-colors"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(entry)}
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage
                    src={entry.imageUrl ?? undefined}
                    alt={entry.displayName}
                    sizes="32px"
                  />
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {entry.displayName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Stand {entry.standLabel} · {entry.sectorName}
                  </p>
                </div>
              </button>
            </li>
          ))}
          {hiddenMatches > 0 ? (
            <li className="sticky bottom-0 border-t bg-background px-3 py-2 text-xs text-muted-foreground">
              Mostrando {visible.length} de {matches.length}
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
