"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangleIcon, SearchIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import CopyToClipboardButton from "@/app/components/common/copy-to-clipboard-button";
import { useCredentials } from "@/app/components/festivals/credentials/credentials-context";
import PrintStateBadge from "@/app/components/festivals/credentials/print-state-badge";
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";
import { Badge } from "@/app/components/ui/badge";
import { Card } from "@/app/components/ui/card";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import {
  matchesPrintFilter,
  matchesSearch,
  namesToCopy,
  type CredentialHolder,
} from "@/app/lib/credentials/calculate";
import {
  CREDENTIAL_GROUP_LABELS,
  CREDENTIAL_GROUPS,
  CREDENTIAL_RESERVATION_STATUS_BADGE,
  CREDENTIAL_RESERVATION_STATUS_LABELS,
  includesGroup,
  PRINT_FILTER_LABELS,
  PRINT_FILTERS,
  type CredentialGroup,
  type PrintFilter,
} from "@/app/lib/credentials/definitions";

const number = (value: number) => value.toLocaleString("es-BO");

function ReservationBadge({ holder }: { holder: CredentialHolder }) {
  const status = holder.stale ? "gone" : holder.reservationStatus;
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant={CREDENTIAL_RESERVATION_STATUS_BADGE[status]}>
      {CREDENTIAL_RESERVATION_STATUS_LABELS[status]}
    </Badge>
  );
}

function HolderName({ holder }: { holder: CredentialHolder }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="font-medium wrap-anywhere">{holder.name}</span>
      {holder.note || holder.archived ? (
        <span className="break-words text-xs text-muted-foreground">
          {[holder.note, holder.archived ? "Archivada" : null].filter(Boolean).join(" · ")}
        </span>
      ) : null}
    </div>
  );
}

function buildColumns(showPrint: boolean): ColumnDef<CredentialHolder>[] {
  const columns: ColumnDef<CredentialHolder>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Nombre en la credencial",
      cell: ({ row }) => <HolderName holder={row.original} />,
    },
    {
      id: "stand",
      accessorFn: (holder) => holder.standLabel ?? "",
      header: "Espacio",
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{row.original.standLabel ?? "—"}</span>
      ),
    },
    {
      id: "reservation",
      accessorFn: (holder) => holder.reservationStatus ?? "",
      header: "Reserva",
      cell: ({ row }) => <ReservationBadge holder={row.original} />,
    },
    {
      id: "named",
      accessorKey: "named",
      header: () => <div className="text-right">Con nombre</div>,
      cell: ({ row }) => (
        <div className="text-right tabular-nums">{number(row.original.named)}</div>
      ),
    },
    {
      id: "unnamed",
      accessorKey: "unnamed",
      header: () => <div className="text-right">Sin nombre</div>,
      cell: ({ row }) => (
        <div className="text-right tabular-nums">{number(row.original.unnamed)}</div>
      ),
    },
  ];
  if (showPrint) {
    columns.push({
      id: "print",
      accessorFn: (holder) => holder.print?.state ?? "",
      header: "Impresión",
      cell: ({ row }) => <PrintStateBadge holder={row.original} />,
    });
  }
  return columns;
}

const COLUMN_TITLES = {
  name: "Nombre en la credencial",
  stand: "Espacio",
  reservation: "Reserva",
  named: "Con nombre",
  unnamed: "Sin nombre",
  print: "Impresión",
};

function MobileRow({ holder, showPrint }: { holder: CredentialHolder; showPrint: boolean }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <HolderName holder={holder} />
        </div>
        {showPrint ? (
          <div className="shrink-0">
            <PrintStateBadge holder={holder} />
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {holder.standLabel ? <span>Espacio {holder.standLabel}</span> : null}
        <ReservationBadge holder={holder} />
        <span>
          <span className="font-medium tabular-nums text-foreground">
            {number(holder.named)}
          </span>{" "}
          con nombre
        </span>
        <span>
          <span className="font-medium tabular-nums text-foreground">
            {number(holder.unnamed)}
          </span>{" "}
          sin nombre
        </span>
      </div>
    </li>
  );
}

/** Nombres (M2): who gets a credential, and with what name. */
export default function CredentialsNamesView({
  showPrint = false,
  actions,
}: {
  /** The print column and filter, once print batches exist. */
  showPrint?: boolean;
  actions?: ReactNode;
}) {
  const { view, filters } = useCredentials();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<"todos" | CredentialGroup>("todos");
  const [print, setPrint] = useState<PrintFilter>("todas");

  const groupOptions = CREDENTIAL_GROUPS.filter((value) => includesGroup(filters, value));
  const visible = useMemo(
    () =>
      view.holders.filter(
        (holder) =>
          (group === "todos" || holder.group === group) &&
          (!showPrint || matchesPrintFilter(holder, print)) &&
          matchesSearch(holder, query),
      ),
    [view.holders, group, print, query, showPrint],
  );
  const names = namesToCopy(visible);
  const columns = useMemo(() => buildColumns(showPrint), [showPrint]);
  const statusNote = [
    "confirmadas",
    filters.statuses.verification_payment ? "en verificación de pago" : null,
    filters.statuses.pending ? "pendientes" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {view.warnings.length > 0 && (
        <Alert>
          <AlertTriangleIcon className="h-4 w-4" aria-hidden />
          <AlertTitle>
            {view.warnings.length === 1
              ? "Hay 1 caso para revisar a mano"
              : `Hay ${view.warnings.length} casos para revisar a mano`}
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {view.warnings.map((warning, index) => (
                <li key={`${warning.kind}-${index}`} className="break-words">
                  {warning.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 flex-[1_1_28rem] flex-wrap items-end gap-3">
            <div className="flex min-w-0 flex-[1_1_14rem] flex-col gap-2 sm:max-w-xs">
              <Label htmlFor="credentials-search">Buscar</Label>
              <div className="relative">
                <SearchIcon
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="credentials-search"
                  type="search"
                  placeholder="Nombre o espacio"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex min-w-0 flex-[0_1_14rem] flex-col gap-2">
              <Label htmlFor="credentials-group">Grupo</Label>
              <Select
                value={group}
                onValueChange={(value) => setGroup(value as "todos" | CredentialGroup)}
              >
                <SelectTrigger id="credentials-group">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los grupos</SelectItem>
                  {groupOptions.map((value) => (
                    <SelectItem key={value} value={value}>
                      {CREDENTIAL_GROUP_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {showPrint && (
              <div className="flex min-w-0 flex-[0_1_14rem] flex-col gap-2">
                <Label htmlFor="credentials-print">Impresión</Label>
                <Select value={print} onValueChange={(value) => setPrint(value as PrintFilter)}>
                  <SelectTrigger id="credentials-print">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRINT_FILTERS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {PRINT_FILTER_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground" data-testid="credentials-names-count">
              <span className="font-semibold tabular-nums text-foreground">
                {number(names.length)}
              </span>{" "}
              {names.length === 1 ? "nombre" : "nombres"}
            </span>
            <CopyToClipboardButton
              text={names.join("\n")}
              label="Copiar nombres"
              toastLabel={
                names.length === 1 ? "1 nombre copiado" : `${number(names.length)} nombres copiados`
              }
            />
            {actions}
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Incluye reservas {statusNote.join(", ").replace(/, ([^,]*)$/, " y $1")}.
        </p>

        <DataTable
          columns={columns}
          data={visible}
          columnTitles={COLUMN_TITLES}
          searchable={false}
          getRowId={(holder) => holder.key}
          renderMobileRow={(holder) => <MobileRow holder={holder} showPrint={showPrint} />}
          emptyMessage="No hay nadie que coincida."
        />
      </Card>

      <p className="text-xs text-muted-foreground">
        El nombre sale del nombre público del perfil; si está vacío se usa nombre y apellido.
        Cada espacio suma las credenciales de su regla y una mesa completa cuenta como 2
        espacios: las que no llevan nombre aparecen en la fila del titular de la reserva.
      </p>
    </div>
  );
}
