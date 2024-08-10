import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/defiinitions";
import { ProfileType } from "@/app/api/users/definitions";
import QrCodeDownload from "@/app/components/payments/qr-code-download";
import { FestivalBase } from "@/app/data/festivals/definitions";

type PendingPaymentProps = {
  festival: FestivalBase;
  invoice: InvoiceWithPaymentsAndStand;
  profile: ProfileType;
};
export default function PendingPayment(props: PendingPaymentProps) {
  return (
    <div className="max-w-screen-sm mx-auto flex flex-col items-center">
      <h1 className="font-bold text-xl my-4">
        Tu reserva fue realizada con éxito
      </h1>
      <h3 className="font-semibold">
        {props.festival.name} - Espacio {props.invoice.reservation.stand.label}
        {props.invoice.reservation.stand.standNumber}
      </h3>
      <p>Descarga el código QR para realizar tu pago</p>
      <QrCodeDownload {...props} />
    </div>
  );
}
