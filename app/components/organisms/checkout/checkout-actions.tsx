"use client";

import { useMemo, useState } from "react";

import RentalTransactionControls from "@/app/components/molecules/rental-transaction-controls";
import CheckoutConfirmButton from "@/app/components/organisms/checkout/checkout-confirm-button";
import OrderDeliveryInfo from "@/app/components/molecules/order-delivery-info";
import type { RentalEligibilityContext } from "@/app/lib/rentals/types";

type CheckoutActionsProps = {
  hasRentalItems: boolean;
  hasAvailableItems: boolean;
  hasPresaleItems: boolean;
  rentalContexts: RentalEligibilityContext[];
  initialReservationId?: number | null;
};

export default function CheckoutActions({
  hasRentalItems,
  hasAvailableItems,
  hasPresaleItems,
  rentalContexts,
  initialReservationId = null,
}: CheckoutActionsProps) {
  const defaultReservationId =
    initialReservationId ?? rentalContexts[0]?.reservationId ?? null;
  const [selectedReservationId, setSelectedReservationId] = useState<
    number | null
  >(defaultReservationId);

  const selectedContext = useMemo(
    () =>
      rentalContexts.find(
        (context) => context.reservationId === selectedReservationId,
      ) ?? rentalContexts[0] ??
      null,
    [rentalContexts, selectedReservationId],
  );

  return (
    <>
      <OrderDeliveryInfo
        hasAvailableItems={hasAvailableItems}
        hasPresaleItems={hasPresaleItems}
      />

      {hasRentalItems && rentalContexts.length > 0 && (
        <RentalTransactionControls
          canPurchase={false}
          canRent
          transactionType="rental"
          onTransactionTypeChange={() => undefined}
          rentalContexts={rentalContexts}
          selectedReservationId={selectedReservationId}
          onSelectedReservationIdChange={setSelectedReservationId}
        />
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-background border-t px-4 py-4 z-40 md:static md:border-0 md:px-0 md:py-0 md:bg-transparent">
        <CheckoutConfirmButton
          hasRentalItems={hasRentalItems}
          rentalFestivalId={selectedContext?.festivalId ?? null}
          rentalReservationId={selectedContext?.reservationId ?? null}
        />
      </div>
    </>
  );
}
