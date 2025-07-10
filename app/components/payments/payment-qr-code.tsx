"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import QrCodeDownload from "@/app/components/payments/qr-code-download";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/definitions";

type PaymentQRCodeProps = {
	invoice: InvoiceWithPaymentsAndStand;
	qrCodeUrl?: string;
};
export function PaymentQRCode(props: PaymentQRCodeProps) {
	const [isLoading, setIsLoading] = useState(true);

	// Simulate loading the QR code
	useEffect(() => {
		const timer = setTimeout(() => {
			setIsLoading(false);
		}, 500);

		return () => clearTimeout(timer);
	}, []);

	return (
		<div className="relative w-64 h-80 border rounded-lg p-4 bg-white">
			{isLoading ? (
				<div className="absolute inset-0 flex items-center justify-center">
					<Loader2 className="h-8 w-8 animate-spin text-primary" />
				</div>
			) : (
				<>
					<div className="absolute top-2 right-2 text-xs font-medium text-primary">
						Bs{props.invoice.amount}
					</div>
					<QrCodeDownload qrCodeUrl={props.qrCodeUrl} />
				</>
			)}
		</div>
	);
}
