"use client";

import { CheckIcon, DownloadIcon, PrinterIcon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { useCredentials } from "@/app/components/festivals/credentials/credentials-context";
import PrintStateBadge from "@/app/components/festivals/credentials/print-state-badge";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogDescription,
  DrawerDialogHeader,
  DrawerDialogTitle,
  DrawerDialogTrigger,
} from "@/app/components/ui/drawer-dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import MobileSearchScreen from "@/app/components/ui/mobile-search-screen";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { createCredentialPrintBatch } from "@/app/lib/credentials/actions";
import {
  batchCountsFor,
  buildView,
  isPrintable,
  matchesSearch,
  type CredentialHolder,
} from "@/app/lib/credentials/calculate";
import {
  CREDENTIAL_GROUP_LABELS,
  CREDENTIAL_GROUPS,
  CREDENTIALS_COPY,
  PRINT_BATCH_NOTE_MAX,
  type CredentialFilters,
} from "@/app/lib/credentials/definitions";
import {
  credentialsExportFilename,
  serializeCredentialsCsv,
} from "@/app/lib/credentials/export";
import { toastActionError } from "@/app/lib/errors/action-error";
import { formatDisplayDate } from "@/app/lib/formatters";
import { cn } from "@/app/lib/utils";

/** Search looks across every group and status, as an admin may add anyone. */
const EVERYTHING: CredentialFilters = {
  statuses: { verification_payment: true, pending: true },
  groups: { external: true, volunteer: true, staff: true },
};

const number = (value: number) => value.toLocaleString("es-BO");

function counts(named: number, unnamed: number) {
  return `${number(named)} con nombre${unnamed ? `, ${number(unnamed)} sin nombre` : ""}`;
}

function credentials(total: number) {
  return `${number(total)} ${total === 1 ? "credencial" : "credenciales"}`;
}

function holderDetail(holder: CredentialHolder) {
  const sent = batchCountsFor(holder);
  return [
    CREDENTIAL_GROUP_LABELS[holder.group],
    holder.standLabel ?? holder.note,
    counts(sent.named, sent.unnamed),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Every holder the new-or-short rule pre-selects under the page's filters. */
export function defaultBatchSelection(holders: readonly CredentialHolder[]): string[] {
  return holders
    .filter((holder) => isPrintable(holder) && holder.print?.needsPrint)
    .map((holder) => holder.key);
}

/**
 * "Marcar como enviadas a imprenta" (M5, M7, M8). Starts with everything that
 * still needs printing under the page's filters; people are added or removed
 * by searching, and an already printed holder added again is a reprint.
 * It sends the names and counts it shows and exports; the server recomputes them and
 * refuses the batch if they changed meanwhile.
 */
export default function PrintBatchDialog() {
  const { festivalId, data, rules, view } = useCredentials();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [initial, setInitial] = useState<string[]>([]);
  /** The print history this dialog was opened on (§6.3). */
  const [lastBatchId, setLastBatchId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const everyone = useMemo(
    () => buildView(data, rules, EVERYTHING).holders.filter(isPrintable),
    [data, rules],
  );
  const byKey = useMemo(
    () => new Map(everyone.map((holder) => [holder.key, holder])),
    [everyone],
  );
  const chosen = selected
    .map((key) => byKey.get(key))
    .filter((holder): holder is CredentialHolder => Boolean(holder));
  const chosenSet = new Set(selected);
  const initialSet = new Set(initial);

  const groups = CREDENTIAL_GROUPS.map((group) => {
    const inGroup = chosen.filter((holder) => holder.group === group);
    const named = inGroup.reduce((sum, holder) => sum + batchCountsFor(holder).named, 0);
    const unnamed = inGroup.reduce((sum, holder) => sum + batchCountsFor(holder).unnamed, 0);
    return { group, named, unnamed };
  }).filter((row) => row.named + row.unnamed > 0);
  const named = groups.reduce((sum, row) => sum + row.named, 0);
  const unnamed = groups.reduce((sum, row) => sum + row.unnamed, 0);
  const total = named + unnamed;

  const results = query.trim()
    ? everyone.filter((holder) => matchesSearch(holder, query)).slice(0, 50)
    : [];
  const removed = initial
    .filter((key) => !chosenSet.has(key))
    .map((key) => byKey.get(key))
    .filter((holder): holder is CredentialHolder => Boolean(holder));
  const added = chosen.filter((holder) => !initialSet.has(holder.key));

  function toggle(key: string) {
    setSelected((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
    );
  }

  function openWith(next: boolean) {
    // Held open while marking: the result closes the session that started it.
    if (!next && isPending) return;
    setOpen(next);
    if (next) {
      const start = defaultBatchSelection(view.holders);
      setInitial(start);
      setSelected(start);
      setLastBatchId(view.print.lastBatch?.id ?? null);
      setQuery("");
      setNote("");
    }
  }

  function exportSelection() {
    const csv = serializeCredentialsCsv(
      chosen.map((holder) => ({ holder, ...batchCountsFor(holder) })),
    );
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = credentialsExportFilename(data.festival).replace(/\.csv$/, "-lote.csv");
    link.click();
    URL.revokeObjectURL(url);
  }

  function submit() {
    startTransition(async () => {
      try {
        const result = await createCredentialPrintBatch({
          festivalId,
          lastBatchId,
          holders: chosen.map((holder) => ({
            key: holder.key,
            name: holder.name,
            note: holder.note,
            standLabel: holder.standLabel,
            ...batchCountsFor(holder),
          })),
          note,
        });
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        setOpen(false);
        router.refresh();
      } catch (error) {
        toastActionError(error, CREDENTIALS_COPY.genericError);
      }
    });
  }

  const title = `Marcar ${credentials(total)} como enviadas a imprenta`;
  const last = view.print.lastBatch;

  const resultRow = (holder: CredentialHolder, inline: boolean) => (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      {inline ? null : (
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-primary",
            chosenSet.has(holder.key) && "bg-primary text-primary-foreground",
          )}
        >
          {chosenSet.has(holder.key) ? <CheckIcon className="h-4 w-4" /> : null}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-medium wrap-anywhere">{holder.name}</span>
        <span className="break-words text-xs text-muted-foreground">{holderDetail(holder)}</span>
      </div>
      <div className="shrink-0">
        <PrintStateBadge holder={holder} />
      </div>
    </div>
  );

  return (
    <>
      <DrawerDialog
        isDesktop={isDesktop}
        open={open}
        // A swipe would only half-close the sheet while marking keeps it open.
        dismissible={!isPending}
        onOpenChange={openWith}
      >
        <DrawerDialogTrigger isDesktop={isDesktop}>
          <Button type="button" wrap>
            <PrinterIcon className="mr-2 h-4 w-4 shrink-0" aria-hidden />
            {CREDENTIALS_COPY.markPrinted}
          </Button>
        </DrawerDialogTrigger>
        <DrawerDialogContent
          isDesktop={isDesktop}
          className={cn(
            "flex flex-col",
            isDesktop ? "max-h-[90dvh] sm:max-w-2xl" : "max-h-[92dvh]",
          )}
        >
          <DrawerDialogHeader isDesktop={isDesktop}>
            <DrawerDialogTitle isDesktop={isDesktop} className="text-left">
              {title}
            </DrawerDialogTitle>
            <DrawerDialogDescription isDesktop={isDesktop} className="text-left">
              {last
                ? `Son las que aparecieron desde la impresión del ${formatDisplayDate(last.createdAt, { day: "numeric", month: "long" })}. Las ${number(last.sent)} de ese lote no se tocan.`
                : "Es el primer envío a imprenta de esta edición."}
            </DrawerDialogDescription>
          </DrawerDialogHeader>

          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto",
              isDesktop ? "pr-1" : "px-4 pb-2",
            )}
          >
            <section aria-label="Resumen del lote" className="flex flex-col gap-2 rounded-lg border p-4">
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay nadie en este lote. Buscá a alguien para sumarlo.
                </p>
              ) : (
                groups.map((row) => (
                  <div key={row.group} className="flex flex-wrap justify-between gap-x-3 text-sm">
                    <span>{CREDENTIAL_GROUP_LABELS[row.group]}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {counts(row.named, row.unnamed)}
                    </span>
                  </div>
                ))
              )}
              <div className="h-px bg-border" />
              <div className="flex flex-wrap justify-between gap-x-3 text-sm font-semibold">
                <span>Total</span>
                <span className="tabular-nums" data-testid="batch-total">
                  {number(total)} · {counts(named, unnamed)}
                </span>
              </div>
              {total > 0 && (
                <Button
                  type="button"
                  variant="link"
                  size="inline"
                  wrap
                  className="-ml-3 self-start"
                  onClick={exportSelection}
                >
                  <DownloadIcon className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                  Exportar estas {number(total)} en CSV
                </Button>
              )}
            </section>

            <section className="flex flex-col gap-2">
              {isDesktop ? (
                <>
                  <Label htmlFor="batch-search">Quitar o sumar a alguien</Label>
                  <div className="relative">
                    <SearchIcon
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      id="batch-search"
                      type="search"
                      placeholder="Buscar por nombre"
                      value={query}
                      autoComplete="off"
                      onChange={(event) => setQuery(event.target.value)}
                      className="pl-9"
                    />
                  </div>
                  {query.trim() !== "" && (
                    <ul className="flex flex-col divide-y rounded-lg border" aria-label="Resultados">
                      {results.length === 0 ? (
                        <li className="p-3 text-sm text-muted-foreground">
                          Nadie con credencial coincide con esa búsqueda.
                        </li>
                      ) : (
                        results.map((holder) => (
                          <li key={holder.key} className="flex items-start gap-3 p-3">
                            <Checkbox
                              id={`batch-${holder.key}`}
                              checked={chosenSet.has(holder.key)}
                              onCheckedChange={() => toggle(holder.key)}
                              aria-label={`Incluir a ${holder.name} en el lote`}
                              className="mt-0.5"
                            />
                            <label htmlFor={`batch-${holder.key}`} className="flex min-w-0 flex-1 cursor-pointer">
                              {resultRow(holder, true)}
                            </label>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </>
              ) : (
                <>
                  <span className="text-sm font-medium">Quitar o sumar a alguien</span>
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start"
                    // Opened mid-save, it would outlive the sheet it edits.
                    disabled={isPending}
                    onClick={() => setSearchOpen(true)}
                  >
                    <SearchIcon className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                    Buscar por nombre
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Se abre una pantalla solo para buscar.
                  </span>
                </>
              )}
            </section>

            {(removed.length > 0 || added.length > 0) && (
              <section className="flex flex-col gap-2" aria-label="Cambios a mano">
                <span className="text-sm font-medium">Cambios a mano</span>
                <ul className="flex flex-col divide-y rounded-lg border">
                  {removed.map((holder) => (
                    <li key={holder.key} className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <div className="flex min-w-0 flex-[1_1_14rem] flex-col gap-0.5">
                        <span className="text-sm font-medium wrap-anywhere">{holder.name}</span>
                        <span className="break-words text-xs text-muted-foreground">
                          Quitada de este lote. Seguirá como{" "}
                          {holder.print?.state === "partial" ? "pendiente" : "nueva"} ·{" "}
                          {holderDetail(holder)}
                        </span>
                      </div>
                      <Button type="button" variant="ghost" size="sm" wrap onClick={() => toggle(holder.key)}>
                        Volver a incluir
                      </Button>
                    </li>
                  ))}
                  {added.map((holder) => (
                    <li key={holder.key} className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <div className="flex min-w-0 flex-[1_1_14rem] flex-col gap-0.5">
                        <span className="text-sm font-medium wrap-anywhere">{holder.name}</span>
                        <span className="break-words text-xs text-muted-foreground">
                          {batchCountsFor(holder).reprint ? "Sumada para reimprimir" : "Sumada a este lote"} ·{" "}
                          {holderDetail(holder)}
                        </span>
                      </div>
                      <Button type="button" variant="ghost" size="sm" wrap onClick={() => toggle(holder.key)}>
                        Quitar
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="flex flex-col gap-2">
              <Label htmlFor="batch-note">Nota</Label>
              <Input
                id="batch-note"
                value={note}
                maxLength={PRINT_BATCH_NOTE_MAX}
                placeholder="Opcional, por ejemplo la imprenta o el pedido"
                onChange={(event) => setNote(event.target.value)}
              />
            </section>
          </div>

          {/* One row, never stacked; on the phone sheet it stays pinned below
              the scrolling content. */}
          <div
            className={cn(
              "grid shrink-0 grid-cols-2 gap-2 border-t pt-4",
              isDesktop ? "sm:flex sm:justify-end" : "px-4 pb-4",
            )}
            data-testid="batch-footer"
          >
            <Button
              type="button"
              variant="outline"
              wrap
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="button" wrap disabled={isPending || total === 0} onClick={submit}>
              {isPending ? "Guardando..." : "Marcar como enviadas"}
            </Button>
          </div>
        </DrawerDialogContent>
      </DrawerDialog>

      {!isDesktop && (
        <MobileSearchScreen<string>
          open={searchOpen}
          onOpenChange={setSearchOpen}
          title="Quitar o sumar a alguien"
          searchInputId="batch-mobile-search"
          searchPlaceholder="Nombre, espacio u organización"
          searchValue={query}
          onSearchValueChange={setQuery}
          keepSearchOnSelect
          dismissLabel="Listo"
          selectedValues={selected}
          options={results.map((holder) => ({ value: holder.key, label: holder.name }))}
          messages={{
            empty: query.trim()
              ? "Nadie con credencial coincide con esa búsqueda."
              : "Escribí un nombre para encontrar a un participante, una organización, un voluntario o alguien del equipo.",
          }}
          headerActions={
            <span className="text-xs text-muted-foreground">{credentials(total)} en el lote</span>
          }
          renderOption={(option) => {
            const holder = byKey.get(String(option.value));
            return holder ? resultRow(holder, false) : option.label;
          }}
          onSelect={(key) => toggle(key)}
        />
      )}
    </>
  );
}
