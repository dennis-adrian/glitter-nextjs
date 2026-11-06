"use client";

import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Skeleton } from "@/app/components/ui/skeleton";
import { previewSkippedPeopleAction } from "@/app/lib/comunicados/actions";
import type {
  ComunicadoAudiencePreview,
  ComunicadoSkippedPerson,
} from "@/app/lib/comunicados/audience";
import type { ComunicadoAudience } from "@/app/lib/comunicados/definitions";
import { formatAudienceCount } from "@/app/lib/distribution_lists/definitions";

/** The server lists this many at most (COMUNICADO_SKIPPED_PREVIEW_LIMIT). */
const LISTED = 50;

type PeopleState =
  | { status: "loading" }
  | { status: "ready"; people: ComunicadoSkippedPerson[] }
  | { status: "error"; message: string };

/**
 * "Ver por qué": who would not receive it, counted by reason, and the first
 * 50 of them by name, read fresh each time it opens.
 */
export default function SkippedDialog({
  open,
  onOpenChange,
  audience,
  preview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audience: ComunicadoAudience;
  preview: ComunicadoAudiencePreview;
}) {
  const [state, setState] = useState<PeopleState>({ status: "loading" });
  const audienceKey = JSON.stringify(audience);

  useEffect(() => {
    if (!open) return;
    let current = true;
    previewSkippedPeopleAction({ audience: JSON.parse(audienceKey) })
      .then((result) => {
        if (!current) return;
        setState(
          result.success
            ? { status: "ready", people: result.people }
            : { status: "error", message: result.message },
        );
      })
      .catch((error: unknown) => {
        console.error("Error listing a comunicado's skipped people", error);
        if (current) {
          setState({
            status: "error",
            message:
              "No pudimos cargar a quiénes no les llega. Probá de nuevo.",
          });
        }
      });
    return () => {
      current = false;
    };
  }, [open, audienceKey]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setState({ status: "loading" });
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Quiénes no lo reciben</DialogTitle>
          <DialogDescription>
            Hoy no les llegaría a{" "}
            {preview.skippedTotal === 1
              ? "1 persona"
              : `${formatAudienceCount(preview.skippedTotal)} personas`}{" "}
            de la audiencia.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-lg border p-3 text-sm">
          {preview.skipped.map((entry) => (
            <div key={entry.reason} className="contents">
              <dt className="text-muted-foreground">{entry.reason}</dt>
              <dd className="text-right tabular-nums">
                {formatAudienceCount(entry.count)}
              </dd>
            </div>
          ))}
        </dl>

        {state.status === "loading" ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : state.status === "error" ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            {state.message}
          </p>
        ) : (
          <div className="space-y-2">
            <ul className="divide-y rounded-lg border" aria-label="Personas">
              {state.people.map((person) => (
                <li
                  key={person.userId}
                  className="flex flex-col gap-0.5 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {person.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {person.email}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {person.reason}
                  </span>
                </li>
              ))}
            </ul>
            {preview.skippedTotal > LISTED && (
              <p className="text-xs text-muted-foreground">
                Mostramos las primeras {LISTED} personas.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
