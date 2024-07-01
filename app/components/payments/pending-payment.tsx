"use client";

import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/defiinitions";
import { ProfileType } from "@/app/api/users/definitions";
import QrCodeDownload from "@/app/components/payments/qr-code-download";
import PaymentProofUpload from "@/app/components/payments/payment-proof-upload";
import { FestivalBase } from "@/app/data/festivals/definitions";

export default function PendingPayment({
  festival,
  invoice,
  profile,
}: {
  festival: FestivalBase;
  invoice: InvoiceWithPaymentsAndStand;
  profile: ProfileType;
}) {
  return (
    <div>
      <h1 className="font-bold text-2xl my-4">
        Tu reserva fue realizado con éxito
      </h1>
      <h3>Descarga el código QR para realizar tu pago</h3>
      <div className="grid md:grid-cols-2 mx-auto justify-center gap-4 items-start">
        <QrCodeDownload festival={festival} profile={profile} />
        <PaymentProofUpload invoice={invoice} />
      </div>
    </div>
  );
}
