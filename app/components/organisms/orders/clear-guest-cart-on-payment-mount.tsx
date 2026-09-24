"use client";

import { useEffect } from "react";

import { clearPersistedGuestCart } from "@/app/components/providers/cart-provider";

/**
 * Clears the persisted guest cart (products and bundles) once the guest
 * payment route has mounted, so a reload never brings back what was ordered.
 */
export function ClearGuestCartOnPaymentMount() {
  useEffect(() => {
    clearPersistedGuestCart();
  }, []);

  return null;
}
