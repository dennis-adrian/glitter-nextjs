import { formatMoney } from "@/app/lib/formatters";
import type { FullTableUpgradePlan } from "@/app/lib/reservations/full-table-upgrade";
import type { FullTableUpgradePreview } from "@/app/lib/reservations/full-table-upgrade-queries";
import { roundMoney } from "@/app/lib/reservations/money";
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
  const table = formatMoney(preview.plan.toPrice);
  const price = preview.plan.priceChanged
    ? `, que pasa a tener el precio de la mesa: ${table}`
    : preview.plan.latePartnerPrepaid > 0
      ? `, que con lo pagado por el compañero ya queda en el precio de la mesa (${table})`
      : `, que ya tiene el precio de la mesa (${table})`;
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
    return `Esta reserva no tiene cobro: solo cambia el precio registrado, ${from}a ${formatMoney(plan.grossAmount)}.`;
  }
  if (!plan.priceChanged) {
    return plan.latePartnerPrepaid > 0
      ? `El monto no cambia: con lo que ya se pagó por el compañero, la reserva ya queda en el precio de la mesa (${formatMoney(plan.toPrice)}). ${unchanged}`
      : `El monto no cambia: la reserva ya tiene el precio de la mesa (${formatMoney(plan.toPrice)}). ${unchanged}`;
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
 * Why the cobro is lower than the table price when a late partner was added:
 * the shared-price difference the owner already paid in credits counts as
 * paid. Said out loud, or "Ya hay Bs X pagados" reads as more than the cobro
 * ever received.
 *
 * Null when no late partner paid anything.
 */
export function describeFullTableUpgradeLatePartner(
  plan: FullTableUpgradePlan,
): string | null {
  if (plan.latePartnerPrepaid <= 0) return null;
  return `Los ${formatMoney(plan.latePartnerPrepaid)} que el titular ya pagó en créditos al agregar a su compañero (la diferencia al precio compartido) cuentan como pagados: el cobro se calcula sobre el precio de la mesa, ${formatMoney(plan.toPrice)}, menos ese monto. El cargo por agregarlo no se descuenta.`;
}

/**
 * An earlier "confirmar con saldo pendiente" the upgrade keeps.
 *
 * The amount an admin waived is a fixed concession: the new cobro takes it off
 * the table price too. Said out loud, or the new amount reads as a
 * miscalculation.
 */
export function describeFullTableUpgradeWriteOff(
  plan: FullTableUpgradePlan,
): string | null {
  if (!plan.priceChanged || plan.writtenOffAmount <= 0) return null;
  return `El monto de ${formatMoney(plan.writtenOffAmount)} que se dio por saldado se mantiene: también se descuenta del nuevo cobro.`;
}

/**
 * What the upgrade does with money already paid, in the terms the service
 * applies it: a balance reopens the reservation, a surplus comes back as
 * credits, a waiting reservation left fully paid is confirmed, anything else
 * only moves the amount.
 *
 * "Pagado" includes what a late partner already paid in credits, because the
 * service counts it. Then it is split into its two parts and compared with
 * what the table asks — never with "el nuevo monto", the cobro the charge line
 * just showed net of that same payment, which it would not add up against
 * (Bs300 of the cobro plus Bs200 of the partner is not Bs50 over a Bs250
 * cobro; it is Bs50 over a Bs450 table). Null when there is nothing to say —
 * no cobro, or no price change.
 */
export function describeFullTableUpgradeSettlement(input: {
  plan: FullTableUpgradePlan;
  reservationStatus: string;
}): string | null {
  const { plan } = input;
  if (plan.currentInvoiceAmount == null || !plan.priceChanged) return null;

  const paidAmount = plan.coveredAmount + plan.latePartnerPrepaid;
  const withLatePartner = plan.latePartnerPrepaid > 0;
  const paid = withLatePartner
    ? `${formatMoney(paidAmount)} pagados (${formatMoney(plan.coveredAmount)} del cobro y ${formatMoney(plan.latePartnerPrepaid)} por el compañero)`
    : `${formatMoney(paidAmount)} pagados`;
  // What the table asks once everything counted is off: the table price, less
  // any discount and write-off the cobro keeps. `owed` is exactly this less
  // what is paid, so the figures always add up.
  const tableAsk = roundMoney(plan.effectiveAmount + plan.latePartnerPrepaid);
  const target = !withLatePartner
    ? "el nuevo monto"
    : tableAsk === plan.toPrice
      ? `los ${formatMoney(plan.toPrice)} de la mesa`
      : `los ${formatMoney(tableAsk)} que cuesta la mesa con lo ya descontado`;
  const confirmed = plan.completesAcceptance
    ? " La reserva queda confirmada."
    : "";
  switch (plan.settlement.kind) {
    case "balance_due": {
      const outstanding = formatMoney(plan.settlement.outstandingAmount);
      if (paidAmount <= 0) {
        // Only a reservation confirmed at no cost — a Bs0 cobro (a full
        // discount, a zero-price stand) or an approved zero-value entitlement
        // — reopens with nothing paid. It owes the difference like a paid one.
        return `La reserva se había confirmado sin costo. Vuelve a quedar pendiente por la diferencia de ${outstanding}, con cinco días para pagarla.`;
      }
      const ofTarget = withLatePartner ? ` de ${target}` : "";
      return input.reservationStatus === "pending"
        ? `Ya hay ${paid}${ofTarget}. La reserva sigue pendiente por la diferencia de ${outstanding} y vuelve a tener cinco días para pagarla.`
        : `Ya hay ${paid}${ofTarget}. La reserva vuelve a quedar pendiente por la diferencia de ${outstanding}, con cinco días para pagarla.`;
    }
    case "overpaid":
      return `Ya hay ${paid}, más que ${target}. Los ${formatMoney(plan.settlement.refundAmount)} de diferencia vuelven como créditos al titular.${confirmed}`;
    default:
      break;
  }

  if (plan.completesAcceptance) {
    return `Ya hay ${paid}, que cubren ${target}. La reserva queda confirmada.`;
  }
  if (paidAmount > 0 && plan.owedAmount <= 0) {
    return withLatePartner
      ? `Lo ya pagado (${formatMoney(plan.coveredAmount)} del cobro y ${formatMoney(plan.latePartnerPrepaid)} por el compañero) cubre ${target}.`
      : "Lo ya pagado cubre el nuevo monto.";
  }
  if (input.reservationStatus === "accepted" && plan.newInvoiceAmount <= 0) {
    return "La reserva sigue confirmada y no queda nada por pagar.";
  }
  // A positive cobro marked paid with nothing registered: the money came in
  // outside the system, so the service neither reopens it nor refunds it.
  if (
    input.reservationStatus === "accepted" &&
    paidAmount <= 0 &&
    !plan.confirmedAtNoCost
  ) {
    return "La reserva figura como pagada sin pagos registrados en el sistema: solo cambia el monto del cobro. No vuelve a quedar pendiente ni se le pide la diferencia.";
  }
  return plan.latePartnerPrepaid > 0
    ? "Todavía no hay pagos del cobro: solo cambia el monto a pagar."
    : "Todavía no hay pagos registrados: solo cambia el monto a pagar.";
}

/**
 * Every paragraph of the confirmation, in order: what joins the reservation,
 * what the cobro becomes and why, what happens to money already paid, and what
 * the admin gives up or should not expect.
 */
export function describeFullTableUpgrade(input: {
  plan: FullTableUpgradePlan;
  reservationStatus: string;
  keptStandLabel: string;
  companionStandLabel: string;
  hasTender: boolean;
}): string[] {
  const { plan } = input;
  const paragraphs = [
    `La reserva suma el espacio ${input.companionStandLabel} y pasa a ocupar la mesa completa: ${input.keptStandLabel} y ${input.companionStandLabel}.`,
    describeFullTableUpgradeCharge(plan),
  ];

  const latePartner = describeFullTableUpgradeLatePartner(plan);
  if (latePartner) paragraphs.push(latePartner);
  const writeOff = describeFullTableUpgradeWriteOff(plan);
  if (writeOff) paragraphs.push(writeOff);
  const settlement = describeFullTableUpgradeSettlement(input);
  if (settlement) paragraphs.push(settlement);

  // The downgrade refuses a reservation with real money on its cobro
  // (approved cash, credits, a proof in review), so once there is some this
  // is a one-way door.
  if (input.hasTender) {
    paragraphs.push(
      "Como ya hay pagos o créditos registrados, después no vas a poder reducirla a media mesa.",
    );
  }

  // The reopened balance gets its reminder task moved to the new deadline, or
  // one created — for the owner, or for the cobro's holder on a legacy row
  // with none — so "no notice" is only true of right now.
  const reminder =
    plan.settlement.kind === "balance_due"
      ? " El recordatorio de pago se reprograma para un día antes del nuevo vencimiento."
      : "";
  paragraphs.push(
    `No se cobran créditos por la mesa completa y no se le envía ningún aviso al participante en este momento.${reminder}`,
  );
  return paragraphs;
}
