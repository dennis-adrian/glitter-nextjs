"use client";

import { useState } from "react";

import CreditAmount from "@/app/components/credits/credit-amount";
import CreditDebtResolveDialog from "@/app/components/credits/admin/credit-debt-resolve-dialog";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { formatDateWithTime } from "@/app/lib/formatters";
import { type CreditDebtAccount } from "@/app/lib/credits/queries";
import { getUserName } from "@/app/lib/users/utils";

type CreditDebtCardProps = {
  account: CreditDebtAccount;
  canResolve: boolean;
};

export default function CreditDebtCard({
  account,
  canResolve,
}: CreditDebtCardProps) {
  const [open, setOpen] = useState(false);
  const participantName = getUserName(account.user) || account.user.email;
  const inDebt = account.debtAmount > 0;

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-red-600">
              <CreditAmount amount={account.ledgerBalance} />
            </p>
            <p className="truncate text-sm">{participantName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {account.user.email}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {inDebt && <Badge variant="red">Debe</Badge>}
            {account.hasDrift && <Badge variant="amber">Descuadre</Badge>}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Saldo en el libro</dt>
          <dd className="text-right">
            <CreditAmount amount={account.ledgerBalance} />
          </dd>
          {account.hasDrift && (
            <>
              <dt className="text-muted-foreground">Saldo en caché</dt>
              <dd className="text-right">
                <CreditAmount amount={account.cachedBalance} />
              </dd>
            </>
          )}
          {account.lastReversalAt && (
            <>
              <dt className="text-muted-foreground">Última reversión</dt>
              <dd className="text-right">
                {formatDateWithTime(account.lastReversalAt)}
              </dd>
            </>
          )}
        </dl>

        {account.hasDrift && (
          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            El saldo en caché no coincide con el libro. El libro manda; revisá
            esta cuenta antes de tocarla.
          </p>
        )}

        {inDebt ? (
          <>
            <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
              Con saldo negativo no puede usar créditos ni iniciar una función
              pagada.
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setOpen(true)}
            >
              Regularizar saldo
            </Button>
            <CreditDebtResolveDialog
              userId={account.user.id}
              participantName={participantName}
              debtAmount={account.debtAmount}
              canResolve={canResolve}
              open={open}
              onOpenChange={setOpen}
            />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            No hay saldo pendiente que regularizar; solo hay que revisar el
            descuadre.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
