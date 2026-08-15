"use client";

import { useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import {
  normalizeParticipantSearch,
  type ParticipantSearchEntry,
} from "@/app/components/maps/festival-nav/festival-nav-participant-search";
import { cn } from "@/app/lib/utils";

type FestivalNavSearchProps = {
  entries: ParticipantSearchEntry[];
  onSelect: (entry: ParticipantSearchEntry) => void;
  value?: string;
  onValueChange?: (value: string) => void;
  flush?: boolean;
};

export default function FestivalNavSearch({
  entries,
  onSelect,
  value,
  onValueChange,
  flush = false,
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
  const results =
    normalized.length > 0
      ? entries.filter(
          (e) =>
            normalizeParticipantSearch(e.displayName).includes(normalized) ||
            normalizeParticipantSearch(e.standLabel).includes(normalized),
        )
      : [];

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
          onFocus={() => setOpen(true)}
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

      {open && results.length > 0 && (
        <ul
          className={cn(
            "absolute top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-background shadow-lg",
            flush ? "left-0 right-0" : "left-4 right-4",
          )}
        >
          {results.map((entry, i) => (
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
        </ul>
      )}
    </div>
  );
}
