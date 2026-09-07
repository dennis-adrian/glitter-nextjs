import { type CreditWalletTopUp } from "@/app/lib/credits/queries";

/** What is left to say once a purchase's voucher window has closed. */
export default function CreditPurchaseOutcome({
  topUp,
}: {
  topUp: CreditWalletTopUp;
}) {
  if (topUp.status === "expired") {
    return (
      <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
        No recibimos el comprobante a tiempo, así que no se acreditó nada. Podés
        empezar una compra nueva desde donde necesitás los créditos.
      </p>
    );
  }

  if (topUp.status === "rejected") {
    return (
      <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
        {topUp.rejectionReason
          ? `Motivo del rechazo: ${topUp.rejectionReason}`
          : "Un administrador rechazó el comprobante."}
      </p>
    );
  }

  return (
    <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
      {topUp.status === "approved"
        ? "Un administrador confirmó el comprobante."
        : "Ya podés usar estos créditos en lo que quieras. Un administrador revisa el comprobante después; si algo no cuadra, te avisamos."}
    </p>
  );
}
