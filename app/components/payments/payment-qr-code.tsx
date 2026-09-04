"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import QrCodeDownload from "@/app/components/payments/qr-code-download";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/definitions";

type PaymentQRCodeProps = {
  /**
   * Only ever read for its amount. Optional because a credit purchase is paid
   * the same way and has no invoice behind it.
   */
  invoice?: InvoiceWithPaymentsAndStand;
  amount?: number;
  qrCodeUrl?: string;
  /** False for the shared zero-amount code, which the payer fills in. */
  qrCoversAmount?: boolean;
};
export function PaymentQRCode(props: PaymentQRCodeProps) {
  const [isLoading, setIsLoading] = useState(true);
  const amount = props.amount ?? props.invoice?.amount ?? 0;

  // Simulate loading the QR code
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative w-64 min-h-80 border rounded-lg p-4 bg-white">
      {isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="absolute top-2 right-2 text-xs font-medium text-primary">
            Bs{amount}
          </div>
          <QrCodeDownload qrCodeUrl={props.qrCodeUrl} />
          {props.qrCodeUrl && !props.qrCoversAmount ? (
            <p className="px-2 text-center text-xs text-muted-foreground">
              Este QR no lleva el monto. Escribe <strong>Bs {amount}</strong> al
              pagar.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
