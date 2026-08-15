import Image from "next/image";

import { Badge } from "@/app/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { FAST_PASS_TICKET_STATUS_LABELS } from "@/app/lib/fast-pass/definitions";
import type { FastPassTicketStatus } from "@/app/lib/fast-pass/definitions";
import FastPassEditHolderForm from "@/app/components/fast-pass/payment/edit-holder-form";

type Props = {
  holderName: string | null;
  festivalDateLabel: string;
  ticketCode: string;
  ticketStatus: FastPassTicketStatus;
  qrDataUrl: string | null;
  childCount?: number;
  editHolder?: React.ComponentProps<typeof FastPassEditHolderForm> | null;
};

export default function FastPassPurchaseTicketCard({
  holderName,
  festivalDateLabel,
  ticketCode,
  ticketStatus,
  qrDataUrl,
  childCount = 0,
  editHolder,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>{holderName ?? "Titular del pase"}</CardTitle>
            <CardDescription>{festivalDateLabel}</CardDescription>
          </div>
          <Badge variant="secondary">
            {FAST_PASS_TICKET_STATUS_LABELS[ticketStatus]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {childCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            Incluye {childCount} menor(es) acompañante(s) bajo tu
            responsabilidad.
          </p>
        ) : null}

        {qrDataUrl && ticketStatus === "valid" ? (
          <div className="mx-auto max-w-xs overflow-hidden rounded-md border bg-white p-4">
            <Image
              src={qrDataUrl}
              alt="QR del ticket Pase Rápido"
              width={256}
              height={256}
              className="mx-auto h-auto w-full"
            />
          </div>
        ) : null}

        <p className="text-center font-mono text-xs text-muted-foreground">
          {ticketCode}
        </p>
        {ticketStatus === "valid" ? (
          <p className="text-xs text-muted-foreground">
            Presentá este QR una sola vez en el acceso prioritario para recibir
            tu pulsera. Después reingresá mostrando la pulsera.
          </p>
        ) : null}
        {ticketStatus === "valid" && editHolder ? (
          <FastPassEditHolderForm {...editHolder} />
        ) : null}
      </CardContent>
    </Card>
  );
}
