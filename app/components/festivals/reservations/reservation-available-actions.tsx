import type { ReactNode } from "react";

export type ReservationAction = {
  /** Stable key for the row; the control itself is opaque here. */
  id: string;
  control: ReactNode;
};

/**
 * `Acciones disponibles` (PRD §12).
 *
 * Framed as a short list of specific things rather than an edit screen,
 * because a reservation is not editable: the stand, the price and the owner
 * are fixed once it exists. Saying so up front is what stops the section
 * reading as a settings page with the settings missing.
 *
 * Each action gets its own full-width row. Side by side they produced a line
 * that read `[Agregar compañero] Liberar tu reserva cuesta 20 créditos. Te
 * faltan 20 créditos. [Comprar 20 créditos]` — a control, then a sentence
 * belonging to the next control, then that control. An action here can carry
 * its own price and its own shortfall, so it needs a line of its own to say so
 * in.
 *
 * The section renders even when nothing applies, because "you cannot change
 * this" is itself the answer to the question a participant came here with.
 */
export default function ReservationAvailableActions({
  actions = [],
  deadlineNote,
  canAct = true,
}: {
  /** Action controls, when any apply to this reservation. */
  actions?: ReservationAction[];
  /** Extra line for a deadline that governs one of the actions. */
  deadlineNote?: string;
  /**
   * Whether this viewer may act. False for a partner: every action here
   * belongs to the owner, so they are told who can rather than left to guess
   * why the section is empty for them.
   */
  canAct?: boolean;
}) {
  return (
    <section className="space-y-3" aria-labelledby="available-actions">
      <h2
        id="available-actions"
        className="font-space-grotesk text-base font-semibold"
      >
        Acciones disponibles
      </h2>
      {deadlineNote && canAct && (
        <p className="text-sm text-muted-foreground">{deadlineNote}</p>
      )}
      {!canAct ? (
        <p className="text-sm text-muted-foreground">
          Solo el titular puede hacer cambios en esta reserva.
        </p>
      ) : actions.length > 0 ? (
        <ul className="divide-y border-t">
          {actions.map((action) => (
            <li key={action.id} className="py-4 last:pb-0">
              {action.control}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Por ahora no hay acciones disponibles para esta reserva.
        </p>
      )}
    </section>
  );
}
