"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import type { CouponBookReconciliation } from "@/app/lib/festival_activites/coupon-book-draft";
import {
  CouponBookDraftAudit,
  CouponBookMovedParticipant,
  hasCouponBookAuditIssues,
  isCouponBookAuditBlocking,
} from "@/app/lib/festival_activites/coupon-book-reconciliation";

type CouponBookReconciliationBannerProps = {
  audit: CouponBookDraftAudit;
  /** Content-only changes (name, promo, stands) since the draft was captured. */
  contentChanges: CouponBookReconciliation;
  /** Moved participants whose new variant has no book in the draft. */
  unresolvedMoves: CouponBookMovedParticipant[];
  onRelocate: () => void;
  onMergeFromSource: () => void;
};

function NameList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-0.5 pl-4">
      {items.map((item, index) => (
        <li key={`${index}-${item}`} className="break-words">
          {item}
        </li>
      ))}
    </ul>
  );
}

/**
 * Tells the admin which participants no longer match the draft and offers the
 * one-click fixes. It names people rather than counting them, so the admin can
 * tell whether the change is expected before touching the books.
 */
export default function CouponBookReconciliationBanner({
  audit,
  contentChanges,
  unresolvedMoves,
  onRelocate,
  onMergeFromSource,
}: CouponBookReconciliationBannerProps) {
  const changedCount = contentChanges.changedParticipationIds.length;
  if (!hasCouponBookAuditIssues(audit) && changedCount === 0) return null;

  const blocking = isCouponBookAuditBlocking(audit);
  const needsMerge =
    audit.unverified.length > 0 ||
    audit.removed.length > 0 ||
    audit.added.length > 0 ||
    audit.withdrawn.length > 0 ||
    changedCount > 0 ||
    unresolvedMoves.length > 0;

  return (
    <div
      role="status"
      className="space-y-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold break-words">
            La cuponera no coincide con los participantes actuales
          </p>
          {blocking ? (
            <p className="break-words">
              No se puede exportar hasta resolverlo: algunos cupones saldrían
              en el libro equivocado o faltarían.
            </p>
          ) : null}
        </div>
      </div>

      {audit.moved.length > 0 ? (
        <div className="space-y-1">
          <p className="font-medium break-words">
            Cambiaron de variante desde que se guardó el borrador:
          </p>
          <NameList
            items={audit.moved.map(
              (item) =>
                `${item.participantName}: ${item.draftVariantLabel} → ${item.currentVariantLabel}${
                  item.included ? "" : " (cupón oculto)"
                }`,
            )}
          />
        </div>
      ) : null}

      {audit.unverified.length > 0 ? (
        <div className="space-y-1">
          <p className="font-medium break-words">
            Están en el libro de otra variante y este borrador es anterior al
            registro de variantes, así que no se sabe si cambiaron de variante
            o si su libro estaba lleno:
          </p>
          <NameList
            items={audit.unverified.map(
              (item) =>
                `${item.participantName}: en ${item.placedVariantLabel}, ahora en ${item.currentVariantLabel}${
                  item.printed ? "" : " (cupón oculto)"
                }`,
            )}
          />
          <p className="break-words">
            Actualizá los participantes desde la fuente para ubicarlos en su
            variante actual.
          </p>
        </div>
      ) : null}

      {audit.removed.length > 0 ? (
        <div className="space-y-1">
          <p className="font-medium">Ya no participan:</p>
          <NameList
            items={audit.removed.map(
              (item) =>
                `${item.participantName}${item.printed ? "" : " (cupón oculto)"}`,
            )}
          />
        </div>
      ) : null}

      {audit.withdrawn.length > 0 ? (
        <div className="space-y-1">
          <p className="font-medium break-words">
            Su promoción ya no está vigente, pero su cupón sigue en el
            borrador:
          </p>
          <NameList
            items={audit.withdrawn.map(
              (item) =>
                `${item.participantName}${item.printed ? "" : " (cupón oculto)"}`,
            )}
          />
        </div>
      ) : null}

      {audit.unplaced.length > 0 ? (
        <div className="space-y-1">
          <p className="font-medium break-words">
            No tienen lugar en ningún libro, así que su cupón no se imprimiría:
          </p>
          <NameList
            items={audit.unplaced.map(
              (item) => `${item.participantName} (${item.variantLabel})`,
            )}
          />
          <p className="break-words">
            Aumentá los cupones de su variante en el editor para hacerles
            lugar.
          </p>
        </div>
      ) : null}

      {audit.added.length > 0 ? (
        <div className="space-y-1">
          <p className="font-medium break-words">
            Se sumaron y todavía no tienen cupón:
          </p>
          <NameList
            items={audit.added.map(
              (item) => `${item.participantName} (${item.variantLabel})`,
            )}
          />
        </div>
      ) : null}

      {changedCount > 0 ? (
        <p className="break-words">
          Datos de cupón modificados: {changedCount} participante(s).
        </p>
      ) : null}

      {unresolvedMoves.length > 0 ? (
        <p className="break-words font-medium">
          No hay libro para la variante de{" "}
          {unresolvedMoves.map((item) => item.participantName).join(", ")}.
          Actualizá los participantes desde la fuente para crearlo.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {audit.moved.length > unresolvedMoves.length ? (
          <Button
            type="button"
            size="sm"
            wrap
            className="text-xs"
            onClick={onRelocate}
          >
            Mover cupones a su variante actual
          </Button>
        ) : null}
        {needsMerge ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            wrap
            className="border-amber-400 bg-card text-xs hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/40"
            onClick={onMergeFromSource}
          >
            Actualizar participantes desde fuente
          </Button>
        ) : null}
      </div>
    </div>
  );
}
