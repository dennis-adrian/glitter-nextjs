"use client";

import { useState } from "react";

import CreditGiftResendButton from "@/app/components/credit_gifts/admin/credit-gift-resend-button";
import CreditGiftRevokeDialog, {
  type CreditGiftRevokeTarget,
} from "@/app/components/credit_gifts/admin/credit-gift-revoke-dialog";
import CreditAmount from "@/app/components/credits/credit-amount";
import { Badge, type BadgeVariant } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { CREDIT_GIFT_RECIPIENT_STATUS_LABELS } from "@/app/lib/credit_gifts/definitions";
import type {
  CreditGiftEmailState,
  CreditGiftRecipientRow,
} from "@/app/lib/credit_gifts/queries";
import { cn } from "@/lib/utils";

const STATUS_VARIANTS: Record<CreditGiftRecipientRow["status"], BadgeVariant> =
  {
    pending: "amber",
    granted: "green",
    skipped: "outline",
    failed: "red",
  };

const EMAIL_LABELS: Record<CreditGiftEmailState, string> = {
  none: "—",
  pending: "Pendiente",
  sent: "Enviado",
  failed: "Falló",
  skipped: "Bloqueado",
};

type CreditGiftRecipientsTableProps = {
  campaignId: number;
  amountPerRecipient: number;
  recipients: CreditGiftRecipientRow[];
  /** Global admins only; festival admins see the actions disabled. */
  canMutate: boolean;
};

export default function CreditGiftRecipientsTable({
  campaignId,
  amountPerRecipient,
  recipients,
  canMutate,
}: CreditGiftRecipientsTableProps) {
  const [revoke, setRevoke] = useState<{
    scope: "one" | "all";
    targets: CreditGiftRevokeTarget[];
  } | null>(null);

  const holders = recipients
    .filter((row) => row.status === "granted" && !row.revokedAt)
    .map((row) => ({
      userId: row.userId,
      name: row.name,
      ledgerBalance: row.ledgerBalance,
    }));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Participantes</h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canMutate || holders.length === 0}
          onClick={() => setRevoke({ scope: "all", targets: holders })}
        >
          Retirar a todos
        </Button>
      </div>
      {!canMutate && (
        <p className="text-xs text-muted-foreground">
          Solo un administrador general puede reenviar avisos o retirar el
          regalo.
        </p>
      )}
      <div className="overflow-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Participante</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>En la app</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead className="text-right">Saldo actual</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recipients.map((row) => {
              const holds = row.status === "granted" && !row.revokedAt;
              return (
                <TableRow key={row.userId}>
                  <TableCell className="min-w-48">
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.email}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant={STATUS_VARIANTS[row.status]}>
                        {CREDIT_GIFT_RECIPIENT_STATUS_LABELS[row.status]}
                      </Badge>
                      {row.revokedAt && (
                        <Badge variant="outline">Retirado</Badge>
                      )}
                    </div>
                    {row.skippedReason && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.skippedReason}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.status !== "granted"
                      ? "—"
                      : row.readAt
                        ? "Leído"
                        : "No leído"}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span
                      className={cn(
                        row.emailState === "failed" && "text-red-700",
                        row.emailState === "skipped" && "text-amber-800",
                      )}
                    >
                      {EMAIL_LABELS[row.emailState]}
                    </span>
                    {row.resendCount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Reenviado {row.resendCount}{" "}
                        {row.resendCount === 1 ? "vez" : "veces"}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <CreditAmount
                      amount={row.ledgerBalance}
                      className={cn(row.ledgerBalance < 0 && "text-red-600")}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <CreditGiftResendButton
                        campaignId={campaignId}
                        userId={row.userId}
                        disabled={!canMutate || !holds}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={!canMutate || !holds}
                        onClick={() =>
                          setRevoke({
                            scope: "one",
                            targets: [
                              {
                                userId: row.userId,
                                name: row.name,
                                ledgerBalance: row.ledgerBalance,
                              },
                            ],
                          })
                        }
                      >
                        Retirar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <CreditGiftRevokeDialog
        campaignId={campaignId}
        amountPerRecipient={amountPerRecipient}
        targets={revoke?.targets ?? []}
        scope={revoke?.scope ?? "one"}
        open={revoke != null}
        onOpenChange={(open) => !open && setRevoke(null)}
      />
    </div>
  );
}
