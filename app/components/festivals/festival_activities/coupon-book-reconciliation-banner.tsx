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
      {items.map((item) => (
        <li key={item} className="break-words">
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
    audit.removed.length > 0 ||
    audit.added.length > 0 ||
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
                  item.printed ? "" : " (cupón oculto)"
                }`,
            )}
          />
          {audit.moved.some((item) => item.inferred) ? (
            <p className="break-words text-amber-900/80 dark:text-amber-200/80">
              En borradores anteriores la variante se dedujo del libro donde
              está el cupón.
            </p>
          ) : null}
        </div>
      ) : null}

      {audit.removed.length > 0 ? (
        <div className="space-y-1">
          <p className="font-medium">Ya no participan:</p>
          <NameList items={audit.removed.map((item) => item.participantName)} />
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
