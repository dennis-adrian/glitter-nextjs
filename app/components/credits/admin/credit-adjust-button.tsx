"use client";

import { CoinsIcon } from "lucide-react";
import { useState } from "react";

import CreditAdjustDialog from "@/app/components/credits/admin/credit-adjust-dialog";
import { Button } from "@/app/components/ui/button";

/** Opens the adjustment dialog; kept apart so the panel can stay a server component. */
export default function CreditAdjustButton({
  userId,
  participantName,
  canAdjust,
}: {
  userId: number;
  participantName: string;
  canAdjust: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!canAdjust}
        // Disabled rather than hidden: an admin without the permission should
        // see that the action exists and why it is out of reach.
        title={
          canAdjust
            ? undefined
            : "Solo un administrador general puede ajustar un saldo"
        }
        onClick={() => setOpen(true)}
      >
        <CoinsIcon className="mr-2 h-4 w-4" />
        Asignar créditos
      </Button>
      <CreditAdjustDialog
        userId={userId}
        participantName={participantName}
        canAdjust={canAdjust}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
