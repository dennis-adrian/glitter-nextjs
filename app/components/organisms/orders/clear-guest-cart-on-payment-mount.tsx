"use client";

import { useEffect } from "react";

import { GUEST_CART_KEY } from "@/app/lib/constants";

/** Clears persisted guest cart once the guest payment route has mounted. */
export function ClearGuestCartOnPaymentMount() {
	useEffect(() => {
		try {
			localStorage.setItem(GUEST_CART_KEY, JSON.stringify([]));
		} catch {
			// localStorage unavailable — ignore (matches CartProvider)
		}
	}, []);

	return null;
}
