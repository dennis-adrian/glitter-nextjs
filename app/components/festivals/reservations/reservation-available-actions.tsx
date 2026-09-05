import type { ReactNode } from "react";

/**
 * `Acciones disponibles` (PRD §12).
 *
 * Framed as a short list of specific things rather than an edit screen,
 * because a reservation is not editable: the stand, the price and the owner
 * are fixed once it exists. Saying so up front is what stops the section
 * reading as a settings page with the settings missing.
 *
 * Phases 4 and 5 fill it — `Agregar compañero` and `Liberar reserva`. Until
 * one of them applies the section still renders, because "you cannot change
 * this" is itself the answer to the question a participant came here with.
 */
export default function ReservationAvailableActions({
  children,
  deadlineNote,
  canAct = true,
}: {
  /** Action controls, when any apply to this reservation. */
  children?: ReactNode;
  /** Extra line for a deadline that governs one of the actions. */
  deadlineNote?: string;
  /**
   * Whether this viewer may act. False for a partner: every action here
   * belongs to the owner, so they are told who can rather than left to guess
   * why the section is empty for them.
   */
  canAct?: boolean;
}) {
  const hasActions = Boolean(children);

  return (
    <section className="space-y-3" aria-labelledby="available-actions">
      <h2 id="available-actions" className="text-sm font-medium">
        Acciones disponibles
      </h2>
      <p className="text-sm text-muted-foreground">
        Tu reserva no se puede editar. No se puede cambiar el espacio, el precio
        ni a quién pertenece.
      </p>
      {deadlineNote && canAct && (
        <p className="text-sm text-muted-foreground">{deadlineNote}</p>
      )}
      {!canAct ? (
        <p className="text-sm text-muted-foreground">
          Solo el titular puede hacer cambios en esta reserva.
        </p>
      ) : hasActions ? (
        // Stacked and boxed, never side by side. Each action carries its own
        // explanation — what it costs, what is still missing — and setting two
        // of those in a row put a paragraph between two buttons and left both
        // misaligned. The border is what makes them read as a short list of
        // things you may do, which is what the heading promises.
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          {children}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Por ahora no hay acciones disponibles para esta reserva.
        </p>
      )}
    </section>
  );
}
