"use client";

import { ArrowRightLeftIcon, Loader2Icon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";

import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import { toastActionError } from "@/app/lib/errors/action-error";
import {
  previewParticipantTransferAction,
  searchTransferCandidatesAction,
  transferReservationParticipationAction,
  type TransferCandidate,
} from "@/app/lib/reservations/participant-transfer-actions";
import type { TransferPreview } from "@/app/lib/reservations/participant-transfer-service";
import { getProfileStatusLabel } from "@/app/lib/users/utils";

const MIN_SEARCH_LENGTH = 2;

type PreviewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; preview: TransferPreview }
  | { kind: "refused"; message: string };

/**
 * Moves one participation from the account on this page to another account,
 * for a participant who lost access to the old one and kept going on a new
 * one.
 *
 * The admin picks the destination, then the server says what will move and
 * what will not before anything is written — the same rules the command runs,
 * so a refusal shows here rather than after confirming. The results are listed
 * inside the dialog, not in a floating menu, so nothing escapes the dialog on
 * a phone.
 */
export default function ParticipantTransferDialog({
  reservationId,
  fromUserId,
  fromUserName,
  festivalName,
}: {
  reservationId: number;
  fromUserId: number;
  fromUserName: string;
  festivalName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [candidates, setCandidates] = useState<TransferCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [target, setTarget] = useState<TransferCandidate | null>(null);
  const [preview, setPreview] = useState<PreviewState>({ kind: "idle" });
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  // Held across retries of one decision, like the other admin commands: a
  // lost answer replays on the same key instead of reporting that the old
  // account is no longer on the reservation. A new destination or an explicit
  // refusal earns a new one.
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const searchRun = useRef(0);
  // Same idea for the preview: only the destination picked last may show its
  // plan, or a slow answer for an earlier pick would sit under the new one and
  // be what the admin confirms.
  const previewRun = useRef(0);

  function clearTarget() {
    previewRun.current += 1;
    setTarget(null);
    setPreview({ kind: "idle" });
  }

  function reset() {
    // Nothing still in flight may publish into a dialog that starts over.
    searchRun.current += 1;
    previewRun.current += 1;
    search.cancel();
    setTerm("");
    setCandidates([]);
    setSearching(false);
    setTarget(null);
    setPreview({ kind: "idle" });
    setNote("");
    setIdempotencyKey(crypto.randomUUID());
  }

  // `run` is the generation taken when the input changed, not when the
  // debounce fired: an older request answering in between must not publish
  // its results or end the loading state of the current input.
  const search = useDebouncedCallback(async (query: string, run: number) => {
    if (run !== searchRun.current) return;
    if (query.trim().length < MIN_SEARCH_LENGTH) {
      setCandidates([]);
      setSearching(false);
      return;
    }
    try {
      const rows = await searchTransferCandidatesAction({
        query,
        excludeUserId: fromUserId,
      });
      if (run === searchRun.current) setCandidates(rows);
    } catch (error) {
      console.error("Error searching transfer candidates", error);
      if (run === searchRun.current) setCandidates([]);
    } finally {
      if (run === searchRun.current) setSearching(false);
    }
  }, 300);

  async function choose(candidate: TransferCandidate) {
    const run = ++previewRun.current;
    setTarget(candidate);
    setIdempotencyKey(crypto.randomUUID());
    setPreview({ kind: "loading" });
    try {
      const result = await previewParticipantTransferAction({
        reservationId,
        fromUserId,
        toUserId: candidate.id,
      });
      if (run !== previewRun.current) return;
      setPreview(
        result.success
          ? { kind: "ready", preview: result.data }
          : { kind: "refused", message: result.message },
      );
    } catch (error) {
      console.error("Error previewing participation transfer", error);
      if (run !== previewRun.current) return;
      setPreview({
        kind: "refused",
        message: "No pudimos revisar la transferencia. Intentá nuevamente.",
      });
    }
  }

  function confirm() {
    if (!target || preview.kind !== "ready") return;
    startTransition(async () => {
      let result;
      try {
        result = await transferReservationParticipationAction({
          reservationId,
          fromUserId,
          toUserId: target.id,
          idempotencyKey,
          note: note.trim() || null,
        });
      } catch (error) {
        console.error("Error transferring participation", error);
        toastActionError(
          error,
          "No se pudo transferir la participación. Intentá nuevamente.",
        );
        return;
      }

      if (!result.success) {
        toast.error(result.message);
        setIdempotencyKey(crypto.randomUUID());
        return;
      }

      toast.success(result.message, {
        description: `${festivalName} ahora está en la cuenta de ${target.name}.`,
      });
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <ArrowRightLeftIcon className="mr-1.5 h-3.5 w-3.5" />
        Transferir
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="gap-4">
          <DialogHeader className="text-left">
            <DialogTitle>Transferir participación</DialogTitle>
            <DialogDescription className="break-words">
              Mové la participación de {fromUserName} en {festivalName} a otra
              cuenta, por ejemplo la cuenta nueva de la misma persona. El
              espacio, el precio y el estado de la reserva no cambian.
            </DialogDescription>
          </DialogHeader>

          {target ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm">
                <div className="flex min-w-0 flex-col">
                  <span className="text-xs text-muted-foreground">
                    Cuenta de destino
                  </span>
                  <span className="break-words font-medium">{target.name}</span>
                  <span className="wrap-anywhere text-muted-foreground">
                    {target.email}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  disabled={pending}
                  onClick={clearTarget}
                >
                  Cambiar
                </Button>
              </div>

              <TransferPreviewPanel state={preview} />

              {preview.kind === "ready" ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`transfer-note-${reservationId}`}>
                    Motivo (opcional)
                  </Label>
                  <Textarea
                    id={`transfer-note-${reservationId}`}
                    value={note}
                    maxLength={500}
                    disabled={pending}
                    placeholder="Por ejemplo: perdió el acceso a su cuenta anterior"
                    onChange={(event) => setNote(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Queda en el historial de la reserva.
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`transfer-search-${reservationId}`}>
                Cuenta de destino
              </Label>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id={`transfer-search-${reservationId}`}
                  className="pl-9"
                  placeholder="Buscar por nombre o correo"
                  value={term}
                  autoComplete="off"
                  onChange={(event) => {
                    const value = event.target.value;
                    setTerm(value);
                    setSearching(value.trim().length >= MIN_SEARCH_LENGTH);
                    search(value, ++searchRun.current);
                  }}
                />
              </div>
              <CandidateList
                term={term}
                searching={searching}
                candidates={candidates}
                onChoose={choose}
              />
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={pending || preview.kind !== "ready"}
              onClick={confirm}
            >
              {pending ? "Transfiriendo…" : "Transferir participación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CandidateList({
  term,
  searching,
  candidates,
  onChoose,
}: {
  term: string;
  searching: boolean;
  candidates: TransferCandidate[];
  onChoose: (candidate: TransferCandidate) => void;
}) {
  if (term.trim().length < MIN_SEARCH_LENGTH) {
    return (
      <p className="text-xs text-muted-foreground">
        Escribí al menos {MIN_SEARCH_LENGTH} letras para buscar.
      </p>
    );
  }
  if (searching) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="h-4 w-4 animate-spin" />
        Buscando…
      </p>
    );
  }
  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No encontramos cuentas de participantes con ese nombre o correo.
      </p>
    );
  }
  return (
    <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
      {candidates.map((candidate) => (
        <li key={candidate.id}>
          <button
            type="button"
            className="flex w-full flex-col rounded-md border px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onChoose(candidate)}
          >
            <span className="break-words font-medium">{candidate.name}</span>
            <span className="wrap-anywhere text-xs text-muted-foreground">
              {candidate.email} ·{" "}
              {getProfileStatusLabel(
                candidate.status as Parameters<typeof getProfileStatusLabel>[0],
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function TransferPreviewPanel({ state }: { state: PreviewState }) {
  if (state.kind === "idle") return null;
  if (state.kind === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="h-4 w-4 animate-spin" />
        Revisando qué se va a transferir…
      </p>
    );
  }
  if (state.kind === "refused") {
    return (
      <p
        role="alert"
        className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm break-words text-destructive"
      >
        {state.message}
      </p>
    );
  }

  const { plan } = state.preview;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        <p className="font-medium">Se va a mover a la cuenta de destino:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {plan.moves.map((line) => (
            <li key={line} className="break-words">
              {line}
            </li>
          ))}
        </ul>
      </div>
      <p className="break-words text-muted-foreground">
        Se quedan en la cuenta de origen los créditos de su billetera, los
        comprobantes que subió, sus infracciones y sanciones, y sus
        inscripciones a actividades.
      </p>
      {plan.warnings.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {plan.warnings.map((line) => (
            <li
              key={line}
              className="rounded-md border border-amber-300 bg-amber-50 p-3 break-words text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
            >
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
