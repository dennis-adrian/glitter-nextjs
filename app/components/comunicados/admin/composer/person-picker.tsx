"use client";

import { Loader2Icon, UserPlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { ComposerPerson } from "@/app/components/comunicados/admin/composer/types";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/app/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import { searchComunicadoPeopleAction } from "@/app/lib/comunicados/actions";
import type { ComunicadoPersonOption } from "@/app/lib/comunicados/queries";

const MIN_TERM = 2;
const SEARCH_DEBOUNCE_MS = 300;

type PersonPickerProps = {
  chosenIds: readonly number[];
  /** Why nobody else can be added now, e.g. the people limit. */
  fullReason: string | null;
  onPick: (person: ComposerPerson) => void;
  disabled?: boolean;
};

/** The last answer, and the term it answers. */
type SearchState =
  | { status: "idle" }
  | { status: "done"; term: string; results: ComunicadoPersonOption[] }
  | { status: "error"; term: string };

/**
 * "Agregar por nombre o correo" (docs/IMPLEMENTATION-comunicados.md G4, K13):
 * participants and global admins, 8 at a time. Someone who cannot receive it
 * shows disabled with the reason, as in the gift picker; on a preview, the
 * participants say they would get a real email.
 */
export default function PersonPicker({
  chosenIds,
  fullReason,
  onPick,
  disabled = false,
}: PersonPickerProps) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const latestRef = useRef(0);
  const chosen = new Set(chosenIds);
  const trimmed = term.trim();

  useEffect(() => {
    if (trimmed.length < MIN_TERM) return;
    const timer = setTimeout(() => {
      latestRef.current += 1;
      const request = latestRef.current;
      searchComunicadoPeopleAction(trimmed).then(
        (results) => {
          // A slower answer for an earlier term never replaces this one.
          if (request !== latestRef.current) return;
          setSearch({ status: "done", term: trimmed, results });
        },
        (error: unknown) => {
          if (request !== latestRef.current) return;
          console.error("Error searching people for a comunicado", error);
          setSearch({ status: "error", term: trimmed });
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  // Only the answer for what is typed now: one for an earlier term would let
  // Enter add someone who does not match it. Until it arrives, "Buscando…".
  const answer =
    search.status !== "idle" && search.term === trimmed ? search : null;
  const results = answer?.status === "done" ? answer.results : [];

  /** Closed, the search starts over: no earlier answer shows on reopening. */
  function reset() {
    latestRef.current += 1;
    setTerm("");
    setSearch({ status: "idle" });
  }

  function pick(person: ComunicadoPersonOption) {
    onPick({
      id: person.id,
      name: person.name,
      email: person.email,
      imageUrl: person.imageUrl,
      isAdmin: person.isAdmin,
      skipReason: person.skipReason,
    });
    reset();
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-expanded={open}
        >
          <UserPlusIcon className="mr-2 h-4 w-4" aria-hidden />
          Agregar por nombre o correo
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(26rem,calc(100vw-2rem))] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={term}
            onValueChange={setTerm}
            placeholder="Buscá por nombre o correo…"
            aria-label="Buscar por nombre o correo"
          />
          {fullReason && (
            <p className="border-b px-3 py-2 text-xs text-muted-foreground">
              {fullReason}
            </p>
          )}
          <CommandList>
            {trimmed.length < MIN_TERM ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Escribí al menos {MIN_TERM} letras para buscar.
              </p>
            ) : !answer ? (
              <p className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden />
                Buscando…
              </p>
            ) : answer.status === "error" ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No se pudo buscar. Intentá de nuevo.
              </p>
            ) : results.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nadie coincide con «{answer.term}».
              </p>
            ) : (
              <CommandGroup>
                {results.map((person) => {
                  const reason = chosen.has(person.id)
                    ? "Ya está en los destinatarios"
                    : (person.skipReason ?? fullReason);
                  return (
                    <CommandItem
                      key={person.id}
                      value={`person-${person.id}`}
                      disabled={reason !== null}
                      onSelect={() => pick(person)}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="truncate">{person.name}</span>
                          {person.isAdmin && (
                            <Badge variant="secondary">Administración</Badge>
                          )}
                          {person.realEmailOnPreview && (
                            <Badge variant="amber">Recibe un correo real</Badge>
                          )}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {person.email}
                        </span>
                        {reason && (
                          <span className="text-xs text-muted-foreground">
                            {reason}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
