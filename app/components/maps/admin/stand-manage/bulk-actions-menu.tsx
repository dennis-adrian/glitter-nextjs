"use client";

import {
  ChevronDownIcon,
  HashIcon,
  LayersIcon,
  SignpostIcon,
  TableIcon,
  TagIcon,
  Trash2Icon,
  Unlink2Icon,
  WalletIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  bulkUpdateStands,
  deleteStands,
  renumberStandsSequentially,
} from "@/app/api/stands/actions";
import {
  declareFullTablePairAction,
  dissolveFullTablePairAction,
} from "@/app/lib/stands/pricing-actions";
import StandPriceDialog from "@/app/components/maps/admin/stand-price-dialog";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
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
  CATEGORY_OPTIONS,
  CONFIRMATION_THRESHOLD,
  STAND_STATUS_OPTIONS,
  StandCategory,
  StandStatus,
  formatPrice,
  getCategoryLabel,
  standDisplayLabel,
} from "@/app/components/maps/admin/stand-manage/shared";

import type { StandRow } from "@/app/components/maps/admin/stand-manage/columns";
import type { FullTableInfo } from "@/app/components/maps/admin/stand-manage/full-table";

type Props = {
  festivalId: number;
  selectedIds: number[];
  selectedRows: StandRow[];
  fullTableByStandId: Map<number, FullTableInfo>;
  rowsById: Map<number, StandRow>;
  hasReservation: boolean;
  onCleared?: () => void;
  onDone?: () => void;
  onOptimisticStatus?: (ids: number[], status: StandStatus) => void;
  onOptimisticCategory?: (ids: number[], category: StandCategory) => void;
  onFailure?: () => void;
};

type DialogKey =
  | null
  | "status"
  | "price"
  | "label"
  | "category"
  | "renumber"
  | "delete"
  | "declareFullTable"
  | "dissolveFullTable";

/**
 * A menu item that is never hidden: an action an admin cannot take right now
 * still says so, and says why, rather than disappearing and reading as a
 * feature that does not exist.
 */
function DisabledReason({ reason }: { reason: string }) {
  return (
    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
      {reason}
    </span>
  );
}

function confirmationNote(count: number) {
  if (count <= CONFIRMATION_THRESHOLD) return null;
  return (
    <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
      Vas a aplicar este cambio a <strong>{count}</strong> espacios. Verifica
      antes de guardar.
    </p>
  );
}

export default function StandBulkActionsMenu({
  festivalId,
  selectedIds,
  selectedRows,
  fullTableByStandId,
  rowsById,
  hasReservation,
  onCleared,
  onDone,
  onOptimisticStatus,
  onOptimisticCategory,
  onFailure,
}: Props) {
  const [dialog, setDialog] = useState<DialogKey>(null);
  const [pending, setPending] = useState(false);

  const [status, setStatus] = useState<StandStatus>("available");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<StandCategory>("illustration");
  const [renumberStart, setRenumberStart] = useState(1);

  const count = selectedIds.length;

  /**
   * Every stand a price change has to touch: the selection, plus the companion
   * of any full-table half in it.
   *
   * A pair must end up with the same prices, so editing one half alone is
   * always refused. Widening the write here — and naming the companion in the
   * dialog — is what makes a paired stand repriceable from this table at all.
   */
  const priceTargets = useMemo(() => {
    const targets = new Map<number, StandRow>();
    for (const row of selectedRows) {
      targets.set(row.id, row);
      const companion = fullTableByStandId.get(row.id)?.companion;
      if (companion) targets.set(companion.id, companion);
    }
    return [...targets.values()];
  }, [selectedRows, fullTableByStandId]);

  const addedCompanions = useMemo(
    () => priceTargets.filter((row) => !selectedIds.includes(row.id)),
    [priceTargets, selectedIds],
  );

  const selectedFullTableGroupIds = useMemo(
    () => [
      ...new Set(
        selectedIds
          .map((id) => fullTableByStandId.get(id)?.groupId)
          .filter((id): id is number => id != null),
      ),
    ],
    [selectedIds, fullTableByStandId],
  );

  const declareReason = useMemo(() => {
    if (count !== 2) {
      return `Seleccioná exactamente dos espacios (llevás ${count}).`;
    }
    if (selectedFullTableGroupIds.length > 0) {
      return "Alguno de los espacios ya es mitad de una mesa completa.";
    }
    if (hasReservation) {
      return "Hay una reserva vigente en la selección.";
    }
    return null;
  }, [count, selectedFullTableGroupIds, hasReservation]);

  const dissolveReason = useMemo(() => {
    if (selectedFullTableGroupIds.length === 0) {
      return "Ningún espacio seleccionado es mitad de una mesa completa.";
    }
    if (selectedFullTableGroupIds.length > 1) {
      return "La selección abarca más de una mesa completa.";
    }
    return null;
  }, [selectedFullTableGroupIds]);

  const dissolveGroupId = selectedFullTableGroupIds[0] ?? null;
  const dissolveMembers = useMemo(() => {
    if (dissolveGroupId == null) return [];
    return [...rowsById.values()].filter(
      (row) => fullTableByStandId.get(row.id)?.groupId === dissolveGroupId,
    );
  }, [dissolveGroupId, rowsById, fullTableByStandId]);

  async function runBulk(
    fn: () => Promise<{ success: boolean; message: string; problems?: string[] }>,
    onSuccess?: () => void,
  ) {
    if (count === 0) return;
    setPending(true);
    try {
      const res = await fn();
      if (res.success) {
        toast.success(res.message);
        onSuccess?.();
        setDialog(null);
        onDone?.();
      } else {
        // Every refusal reason at once, so one fix pass is enough.
        toast.error(
          res.problems?.length
            ? `${res.message} ${res.problems.join(" ")}`
            : res.message,
        );
        onFailure?.();
      }
    } catch {
      toast.error("Error al aplicar el cambio. Intenta de nuevo.");
      onFailure?.();
    } finally {
      setPending(false);
    }
  }

  if (count === 0) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {count} espacio{count !== 1 ? "s" : ""} seleccionado
          {count !== 1 ? "s" : ""}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" disabled={pending}>
                Editar selección
                <ChevronDownIcon className="ml-1 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setDialog("status")}>
                <SignpostIcon className="mr-2 h-4 w-4" />
                Cambiar estado
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog("category")}>
                <LayersIcon className="mr-2 h-4 w-4" />
                Cambiar categoría
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog("price")}>
                <WalletIcon className="mr-2 h-4 w-4" />
                Establecer precio
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog("label")}>
                <TagIcon className="mr-2 h-4 w-4" />
                Establecer etiqueta
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={declareReason != null}
                onSelect={() => setDialog("declareFullTable")}
              >
                <TableIcon className="mr-2 h-4 w-4 shrink-0" />
                <span>
                  Convertir en mesa completa
                  {declareReason && <DisabledReason reason={declareReason} />}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={dissolveReason != null}
                onSelect={() => setDialog("dissolveFullTable")}
              >
                <Unlink2Icon className="mr-2 h-4 w-4 shrink-0" />
                <span>
                  Separar la mesa completa
                  {dissolveReason && <DisabledReason reason={dissolveReason} />}
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setDialog("renumber")}>
                <HashIcon className="mr-2 h-4 w-4" />
                Renumerar en secuencia
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="destructive"
            size="sm"
            disabled={pending || hasReservation}
            title={
              hasReservation
                ? "No se pueden eliminar espacios con reservas"
                : undefined
            }
            onClick={() => setDialog("delete")}
          >
            <Trash2Icon className="mr-1 h-4 w-4" />
            Eliminar
          </Button>

          {onCleared && (
            <Button variant="ghost" size="sm" onClick={onCleared}>
              <XIcon className="mr-1 h-4 w-4" />
              Limpiar
            </Button>
          )}
        </div>
      </div>

      <Dialog
        open={dialog === "status"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar estado ({count})</DialogTitle>
          </DialogHeader>
          {confirmationNote(count)}
          <div className="grid gap-2">
            <Label>Estado</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as StandStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAND_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                onOptimisticStatus?.(selectedIds, status);
                void runBulk(() =>
                  bulkUpdateStands({
                    festivalId,
                    standIds: selectedIds,
                    patch: { status },
                  }),
                );
              }}
            >
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "category"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar categoría ({count})</DialogTitle>
          </DialogHeader>
          {confirmationNote(count)}
          <div className="grid gap-2">
            <Label>Categoría</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as StandCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                onOptimisticCategory?.(selectedIds, category);
                void runBulk(() =>
                  bulkUpdateStands({
                    festivalId,
                    standIds: selectedIds,
                    patch: { standCategory: category },
                  }),
                );
              }}
            >
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The map editor's dialog, reused rather than reimplemented: it already
          handles both prices, seeds only fields the whole selection agrees on,
          and surfaces the server's pair refusals in full. */}
      <StandPriceDialog
        stands={priceTargets.map((row) => ({
          id: row.id,
          label: row.label,
          standNumber: row.standNumber,
          standCategory: row.standCategory,
          individualPrice: row.individualPrice,
          sharedPrice: row.sharedPrice,
        }))}
        open={dialog === "price"}
        onOpenChange={(next) => setDialog(next ? "price" : null)}
        notice={
          addedCompanions.length > 0 ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Las dos mitades de una mesa completa deben quedar al mismo precio,
              así que este cambio también alcanza a{" "}
              <strong>
                {addedCompanions.map(standDisplayLabel).join(", ")}
              </strong>
              . Si querés precios distintos, separá la mesa primero.
            </p>
          ) : undefined
        }
        onSaved={() => {
          setDialog(null);
          onDone?.();
        }}
      />

      <Dialog
        open={dialog === "label"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Establecer etiqueta ({count})</DialogTitle>
            <DialogDescription>
              Reemplaza la etiqueta completa de todos los espacios
              seleccionados.
            </DialogDescription>
          </DialogHeader>
          {confirmationNote(count)}
          <div className="grid gap-2">
            <Label htmlFor="bulk-label">Etiqueta</Label>
            <Input
              id="bulk-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="p. ej. S"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button
              disabled={pending || !label.trim()}
              onClick={() => {
                const trimmed = label.trim();
                void runBulk(
                  () =>
                    bulkUpdateStands({
                      festivalId,
                      standIds: selectedIds,
                      patch: { label: trimmed },
                    }),
                  () => setLabel(""),
                );
              }}
            >
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "renumber"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renumerar en secuencia ({count})</DialogTitle>
            <DialogDescription>
              El primer espacio seleccionado (por número de stand, luego ID)
              recibirá el número inicial; los siguientes serán consecutivos.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="renumber-start">Número inicial</Label>
            <Input
              id="renumber-start"
              type="number"
              min={1}
              value={renumberStart}
              onChange={(e) =>
                setRenumberStart(Math.max(1, Number(e.target.value) || 1))
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                void runBulk(() =>
                  renumberStandsSequentially({
                    festivalId,
                    standIds: selectedIds,
                    startNumber: renumberStart,
                  }),
                )
              }
            >
              {pending ? "Aplicando…" : "Aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "declareFullTable"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convertir en mesa completa</DialogTitle>
            <DialogDescription>
              Los dos espacios pasan a ser una sola mesa de 240 × 60 cm que un
              participante puede tomar entera pagando con créditos. Se agrupan y
              se declaran en un solo paso.
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-2 text-sm">
            {selectedRows.map((row) => (
              <li key={row.id} className="rounded-md border p-3">
                <p className="font-medium">{standDisplayLabel(row)}</p>
                <p className="text-muted-foreground">
                  {getCategoryLabel(row.standCategory as StandCategory)} ·
                  individual {formatPrice(row.individualPrice)}
                  {row.sharedPrice != null
                    ? ` · compartido ${formatPrice(row.sharedPrice)}`
                    : " · sin precio compartido"}
                </p>
              </li>
            ))}
          </ul>

          <p className="text-xs text-muted-foreground">
            Ambas mitades deben coincidir en categoría, sector, tipo de
            participación, subcategorías y precios, y estar alineadas en el
            plano. Si algo no coincide, el servidor lo rechaza y te dice
            exactamente qué.
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button
              disabled={pending || declareReason != null}
              onClick={() =>
                void runBulk(() =>
                  declareFullTablePairAction({ standIds: selectedIds }),
                )
              }
            >
              {pending ? "Declarando…" : "Declarar mesa completa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "dissolveFullTable"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Separar la mesa completa</DialogTitle>
            <DialogDescription>
              Los espacios vuelven a ser independientes: dejan de ser una mesa
              completa y dejan de estar agrupados. Cada uno se puede reservar y
              cotizar por separado.
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-2 text-sm">
            {dissolveMembers.map((row) => (
              <li key={row.id} className="rounded-md border p-3">
                <p className="font-medium">{standDisplayLabel(row)}</p>
                <p className="text-muted-foreground">
                  {getCategoryLabel(row.standCategory as StandCategory)} ·
                  individual {formatPrice(row.individualPrice)}
                </p>
              </li>
            ))}
          </ul>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={pending || dissolveGroupId == null}
              onClick={() =>
                void runBulk(() =>
                  dissolveFullTablePairAction({ groupId: dissolveGroupId }),
                )
              }
            >
              {pending ? "Separando…" : "Separar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar {count} espacio(s)</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. No puedes eliminar espacios con
              reservas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={pending || hasReservation}
              onClick={() => void runBulk(() => deleteStands(selectedIds))}
            >
              {pending ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
