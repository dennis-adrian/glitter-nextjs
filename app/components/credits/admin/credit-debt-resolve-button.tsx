"use client";

import { useState } from "react";

import CreditDebtResolveDialog from "@/app/components/credits/admin/credit-debt-resolve-dialog";
import { Button } from "@/app/components/ui/button";

/** Opens the debt dialog; kept apart so the account page can stay a server component. */
export default function CreditDebtResolveButton({
  userId,
  participantName,
  debtAmount,
  canResolve,
}: {
  userId: number;
  participantName: string;
  debtAmount: number;
  canResolve: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!canResolve}
        title={
          canResolve
            ? undefined
            : "Solo un administrador general puede regularizar un saldo"
        }
        onClick={() => setOpen(true)}
      >
        Regularizar saldo
      </Button>
      <CreditDebtResolveDialog
        userId={userId}
        participantName={participantName}
        debtAmount={debtAmount}
        canResolve={canResolve}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
