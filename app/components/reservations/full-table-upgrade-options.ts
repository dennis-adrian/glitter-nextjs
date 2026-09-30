import { formatMoney } from "@/app/lib/formatters";
import type { FullTableUpgradePlan } from "@/app/lib/reservations/full-table-upgrade";
import type { FullTableUpgradePreview } from "@/app/lib/reservations/full-table-upgrade-queries";
import { isMovableReservationStatus } from "@/app/lib/reservations/stand-change";

/**
 * Why this reservation cannot be widened to its full table, if it cannot.
 *
 * Returned as a reason rather than a boolean so the control stays on the page
 * and says what is wrong: a vanished control reads as a missing feature. The
 * order is the service's, so the reason shown is the refusal the admin would
 * otherwise get back from the server.
 */
export function fullTableUpgradeDisabledReason(input: {
  isGlobalAdmin: boolean;
  reservationStatus: string;
  liveMemberCount: number;
  preview: FullTableUpgradePreview;
}): string | null {
  const { preview } = input;
  if (!input.isGlobalAdmin) {
    return "Solo un administrador general puede ampliar una reserva.";
  }
  if (
    !isMovableReservationStatus(input.reservationStatus) ||
    input.liveMemberCount === 0
  ) {
    return "Esta reserva ya no ocupa un espacio.";
  }
  if (input.liveMemberCount !== 1) {
    return "Esta reserva ya ocupa la mesa completa.";
  }
  if (!preview.inFullTableGroup) {
    return "El espacio de esta reserva no forma parte de una mesa completa.";
  }
  if (preview.groupIssue === "malformed") {
    return "La mesa no tiene exactamente dos espacios.";
  }
  if (preview.groupIssue === "unpriced") {
    return "La mesa no tiene precio configurado.";
  }
  if (preview.companionState === "occupied") {
    return "La otra mitad ya está ocupada por otra reserva.";
  }
  if (preview.companionState === "held") {
    return "Alguien está reservando la otra mitad en este momento.";
  }
  // Only a price change is judged against the submission; an upgrade that
  // leaves the amount alone has nothing for the reviewer to lose track of.
  if (preview.proofUnderReview && preview.plan?.priceChanged) {
    return "Hay un comprobante o una solicitud en revisión. Resolvelo antes de ampliar la reserva.";
  }
  // The service refuses this outright (legacy rows without an owner), and no
  // retry could get past it.
  if (preview.plan?.settlement.kind === "overpaid" && !preview.hasOwner) {
    return "Lo ya pagado supera el precio de la mesa y la reserva no tiene titular a quien devolverle la diferencia.";
  }
  // Unreachable while the preview keeps its own invariants (a plan exists
  // exactly when the table is well formed and priced), but the button needs
  // the plan and its expectation to send anything at all.
  if (!preview.plan || !preview.expected || !preview.companion) {
    return "No se pudo calcular el monto de la mesa completa.";
  }
  return null;
}

/**
 * The card's description above the upgrade button.
 *
 * It only offers the upgrade when the button is enabled; otherwise it states
 * the table's shape and leaves the why to the disabled reason, so the two
 * never contradict each other.
 */
export function describeFullTableUpgradeCard(input: {
  preview: FullTableUpgradePreview;
  disabledReason: string | null;
}): string {
  const { preview } = input;
  const kept = preview.keptStand.label;
  if (input.disabledReason != null || !preview.companion || !preview.plan) {
    const companion = preview.companion
      ? ` con ${preview.companion.label}`
      : "";
    return `El espacio ${kept} forma parte de una mesa completa${companion}.`;
  }
  const price = preview.plan.priceChanged
    ? `, que pasa a tener el precio de la mesa: ${formatMoney(preview.plan.toPrice)}`
    : `, que ya tiene el precio de la mesa (${formatMoney(preview.plan.toPrice)})`;
  return `El espacio ${kept} forma parte de una mesa completa. Podés sumar la otra mitad (${preview.companion.label}) a esta reserva${price}.`;
}

/**
 * What happens to the cobro itself: the before and after amounts, both net of
 * the discount, so the two numbers are comparable.
 */
export function describeFullTableUpgradeCharge(
  plan: FullTableUpgradePlan,
): string {
  const unchanged =
    "Los participantes y los pagos registrados quedan como están.";
  if (plan.currentInvoiceAmount == null) {
    // An external participant's reservation: there is no cobro to reprice,
    // only the price on record.
    if (!plan.priceChanged) {
      return "Esta reserva no tiene cobro y su precio registrado ya es el de la mesa.";
    }
    const from =
      plan.fromPrice == null ? "" : `de ${formatMoney(plan.fromPrice)} `;
    return `Esta reserva no tiene cobro: solo cambia el precio registrado, ${from}a ${formatMoney(plan.toPrice)}.`;
  }
  if (!plan.priceChanged) {
    return `El monto no cambia: la reserva ya tiene el precio de la mesa (${formatMoney(plan.toPrice)}). ${unchanged}`;
  }

  const change =
    plan.currentInvoiceAmount === plan.newInvoiceAmount
      ? `El cobro se mantiene en ${formatMoney(plan.newInvoiceAmount)}`
      : `El cobro pasa de ${formatMoney(plan.currentInvoiceAmount)} a ${formatMoney(plan.newInvoiceAmount)}`;
  const discount =
    plan.discountAmount > 0
      ? `, manteniendo el descuento de ${formatMoney(plan.discountAmount)}`
      : "";
  return `${change}${discount}. ${unchanged}`;
}

/**
 * The part of an earlier "confirmar con saldo pendiente" the upgrade undoes.
 *
 * Repricing recomputes the cobro from the table price and the discount, so an
 * amount an admin wrote off comes back into what is owed. Said out loud, or the
 * balance below reads as a miscalculation.
 */
export function describeFullTableUpgradeWriteOff(
  plan: FullTableUpgradePlan,
): string | null {
  if (!plan.priceChanged || plan.writtenOffAmount <= 0) return null;
  return `El monto de ${formatMoney(plan.writtenOffAmount)} que se dio por saldado no se mantiene: el nuevo cobro se calcula sobre el precio de la mesa.`;
}

/**
 * What the upgrade does with money already paid, in the terms the service
 * applies it: a balance reopens the reservation, a surplus comes back as
 * credits, anything else only moves the amount.
 *
 * Null when there is nothing to say — no cobro, or no price change.
 */
export function describeFullTableUpgradeSettlement(input: {
  plan: FullTableUpgradePlan;
  reservationStatus: string;
}): string | null {
  const { plan } = input;
  if (plan.currentInvoiceAmount == null || !plan.priceChanged) return null;

  const covered = formatMoney(plan.coveredAmount);
  switch (plan.settlement.kind) {
    case "balance_due": {
      const outstanding = formatMoney(plan.settlement.outstandingAmount);
      return input.reservationStatus === "pending"
        ? `Ya hay ${covered} pagados. La reserva sigue pendiente por la diferencia de ${outstanding} y vuelve a tener cinco días para pagarla.`
        : `Ya hay ${covered} pagados. La reserva vuelve a quedar pendiente por la diferencia de ${outstanding}, con cinco días para pagarla.`;
    }
    case "overpaid":
      return `Ya hay ${covered} pagados, más que el nuevo monto. Los ${formatMoney(plan.settlement.refundAmount)} de diferencia vuelven como créditos al titular.`;
    default:
      break;
  }

  if (plan.coveredAmount > 0) return "Lo ya pagado cubre el nuevo monto.";
  // Nothing paid on an accepted reservation means it was accepted at no cost:
  // a zero-value entitlement, or a cobro written off in full. The switch's rule
  // leaves it accepted and its cobro settled, so the difference is never asked
  // for.
  if (input.reservationStatus === "accepted") {
    return plan.newInvoiceAmount > 0
      ? `La reserva sigue confirmada y su cobro no vuelve a quedar pendiente, aunque ahora es de ${formatMoney(plan.newInvoiceAmount)}: no se le pide la diferencia al participante.`
      : "La reserva sigue confirmada y no queda nada por pagar.";
  }
  return "Todavía no hay pagos registrados: solo cambia el monto a pagar.";
}

/**
 * Every paragraph of the confirmation, in order: what joins the reservation,
 * what the cobro becomes, what happens to money already paid, and what the
 * admin gives up or should not expect.
 */
export function describeFullTableUpgrade(input: {
  plan: FullTableUpgradePlan;
  reservationStatus: string;
  keptStandLabel: string;
  companionStandLabel: string;
  hasOwner: boolean;
  hasTender: boolean;
}): string[] {
  const { plan } = input;
  const paragraphs = [
    `La reserva suma el espacio ${input.companionStandLabel} y pasa a ocupar la mesa completa: ${input.keptStandLabel} y ${input.companionStandLabel}.`,
    describeFullTableUpgradeCharge(plan),
  ];

  const writeOff = describeFullTableUpgradeWriteOff(plan);
  if (writeOff) paragraphs.push(writeOff);
  const settlement = describeFullTableUpgradeSettlement(input);
  if (settlement) paragraphs.push(settlement);

  // The downgrade refuses any reservation with a payment or credit allocation
  // row, so once there is one this is a one-way door.
  if (input.hasTender) {
    paragraphs.push(
      "Como ya hay pagos o créditos registrados, después no vas a poder reducirla a media mesa.",
    );
  }

  // The reopened balance gets its reminder task moved to the new deadline (or
  // one created for the owner), so "no notice" is only true of right now.
  const reminder =
    plan.settlement.kind === "balance_due" && input.hasOwner
      ? " El recordatorio de pago se reprograma para un día antes del nuevo vencimiento."
      : "";
  paragraphs.push(
    `No se cobran créditos por la mesa completa y no se le envía ningún aviso al participante en este momento.${reminder}`,
  );
  return paragraphs;
}
