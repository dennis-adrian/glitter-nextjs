"use client";

import { useState } from "react";

import CreditTopUpReviewDialog from "@/app/components/credits/admin/credit-top-up-review-dialog";
import { Button } from "@/app/components/ui/button";
import type {
  CreditPurchaseReviewContext,
  CreditPurchaseRow,
} from "@/app/lib/credits/admin-queries";
import { getUserName } from "@/app/lib/users/utils";

/** Opens the voucher review for one purchase, from its row in the list. */
export default function CreditPurchaseReviewButton({
  purchase,
  review,
  canReview,
}: {
  purchase: CreditPurchaseRow;
  review: CreditPurchaseReviewContext;
  canReview: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        className="h-8"
        onClick={() => setOpen(true)}
      >
        Revisar
      </Button>
      <CreditTopUpReviewDialog
        topUpId={purchase.id}
        amount={purchase.amount}
        participantName={getUserName(purchase.user) || purchase.user.email}
        voucherUrl={purchase.voucherUrl}
        ledgerBalance={review.ledgerBalance}
        balanceAfterReversal={review.balanceAfterReversal}
        spentSinceSubmission={review.spentSinceSubmission}
        canReview={canReview}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
