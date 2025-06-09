import CompletePaymentButton from "@/app/components/payments/complete-payment-button";
import { PaymentQRCode } from "@/app/components/payments/payment-qr-code";

import { CardContent } from "@/app/components/ui/card";

import { Card } from "@/app/components/ui/card";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/definitions";
import { getQRCode } from "@/app/lib/qr_codes/actions";

type QRCodeDetailsProps = {
  invoice: InvoiceWithPaymentsAndStand;
};

export default async function QRCodeDetails({ invoice }: QRCodeDetailsProps) {
	const qrCode = await getQRCode(invoice.amount);

	return (
		<div>
			<Card>
				<CardContent className="pt-6">
					<div className="flex flex-col items-center">
						<h2 className="text-xl font-semibold mb-2">Código QR para Pagar</h2>
						<p className="text-center text-muted-foreground mb-4">
							Usa tu app de banco o app de pago para escanear este código
						</p>

						<PaymentQRCode invoice={invoice} qrCodeUrl={qrCode?.qrCodeUrl} />
					</div>
				</CardContent>
			</Card>

			<div className="mt-4">
				<CompletePaymentButton invoice={invoice} />
			</div>

			{/* <div className="mt-4 text-center">
        <p className="text-sm text-muted-foreground">
          ¿Tienes problemas?{" "}
          <Link href="#" className="text-primary hover:underline">
            Contacta a soporte
          </Link>
        </p>
      </div> */}
		</div>
	);
}
