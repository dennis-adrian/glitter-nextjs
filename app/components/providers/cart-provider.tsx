"use client";

import { GuestCartItem } from "@/app/lib/cart/definitions";
import { MAX_CART_LINE_QUANTITY } from "@/app/lib/constants";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";

const GUEST_CART_KEY = "glitter_guest_cart";

type CartContextValue = {
	itemCount: number;
	setItemCount: (n: number) => void;
	isOpen: boolean;
	openCart: () => void;
	closeCart: () => void;
	isAuthenticated: boolean;
	// Guest cart (only populated when isAuthenticated is false)
	guestItems: GuestCartItem[];
	guestCartHydrated: boolean;
	addGuestItem: (item: GuestCartItem) => void;
	removeGuestItem: (productId: number) => void;
	updateGuestItemQuantity: (productId: number, quantity: number) => void;
	clearGuestCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function useCart() {
	const context = useContext(CartContext);
	if (!context) {
		throw new Error("useCart must be used within CartProvider");
	}
	return context;
}

function readGuestCart(): GuestCartItem[] {
	try {
		const stored = localStorage.getItem(GUEST_CART_KEY);
		if (!stored) return [];
		return JSON.parse(stored) as GuestCartItem[];
	} catch {
		return [];
	}
}

function writeGuestCart(items: GuestCartItem[]) {
	try {
		localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
	} catch {
		// localStorage unavailable (e.g. private mode quota exceeded) — ignore
	}
}

export function CartProvider({
	initialItemCount,
	isAuthenticated,
	children,
}: {
	initialItemCount: number;
	isAuthenticated: boolean;
	children: React.ReactNode;
}) {
	const [itemCount, setItemCount] = useState(initialItemCount);
	const [isOpen, setIsOpen] = useState(false);
	const [guestItems, setGuestItems] = useState<GuestCartItem[]>([]);
	const [guestCartHydrated, setGuestCartHydrated] = useState(false);

	// Hydrate guest cart from localStorage after mount (client only).
	// When authenticated, skip localStorage but still mark hydrated so consumers never wait forever.
	useEffect(() => {
		if (!isAuthenticated) {
			const items = readGuestCart();
			setGuestItems(items);
			setItemCount(items.reduce((sum, i) => sum + i.quantity, 0));
		}
		setGuestCartHydrated(true);
	}, [isAuthenticated]);

	const openCart = useCallback(() => setIsOpen(true), []);
	const closeCart = useCallback(() => setIsOpen(false), []);

	const addGuestItem = useCallback((incoming: GuestCartItem) => {
		setGuestItems((prev) => {
			const existing = prev.find((i) => i.productId === incoming.productId);
			let updatedGuestItems: GuestCartItem[];
			if (existing) {
				const newQty = Math.min(
					existing.quantity + incoming.quantity,
					MAX_CART_LINE_QUANTITY,
					incoming.product.stock ?? MAX_CART_LINE_QUANTITY,
				);
				updatedGuestItems = prev.map((i) =>
					i.productId === incoming.productId ? { ...i, quantity: newQty } : i,
				);
			} else {
				const cappedQty = Math.min(
					incoming.quantity,
					MAX_CART_LINE_QUANTITY,
					incoming.product.stock ?? MAX_CART_LINE_QUANTITY,
				);
				updatedGuestItems = [...prev, { ...incoming, quantity: cappedQty }];
			}
			writeGuestCart(updatedGuestItems);
			setItemCount(updatedGuestItems.reduce((sum, i) => sum + i.quantity, 0));
			return updatedGuestItems;
		});
	}, []);

	const removeGuestItem = useCallback((productId: number) => {
		setGuestItems((prev) => {
			const updatedGuestItems = prev.filter((i) => i.productId !== productId);
			writeGuestCart(updatedGuestItems);
			setItemCount(updatedGuestItems.reduce((sum, i) => sum + i.quantity, 0));
			return updatedGuestItems;
		});
	}, []);

	const updateGuestItemQuantity = useCallback(
		(productId: number, quantity: number) => {
			setGuestItems((prev) => {
				const guestCartLine = prev.find((i) => i.productId === productId);
				let updatedGuestItems: GuestCartItem[];

				if (quantity <= 0) {
					updatedGuestItems = prev.filter((i) => i.productId !== productId);
				} else if (!guestCartLine) {
					updatedGuestItems = prev;
				} else {
					const stockCap =
						guestCartLine.product?.stock ?? MAX_CART_LINE_QUANTITY;
					const clampedQty = Math.min(
						quantity,
						MAX_CART_LINE_QUANTITY,
						stockCap,
					);
					if (clampedQty <= 0) {
						updatedGuestItems = prev.filter((i) => i.productId !== productId);
					} else {
						updatedGuestItems = prev.map((i) =>
							i.productId === productId ? { ...i, quantity: clampedQty } : i,
						);
					}
				}
				writeGuestCart(updatedGuestItems);
				setItemCount(updatedGuestItems.reduce((sum, i) => sum + i.quantity, 0));
				return updatedGuestItems;
			});
		},
		[],
	);

	const clearGuestCart = useCallback(() => {
		setGuestItems([]);
		writeGuestCart([]);
		setItemCount(0);
	}, []);

	return (
		<CartContext.Provider
			value={{
				itemCount,
				setItemCount,
				isOpen,
				openCart,
				closeCart,
				isAuthenticated,
				guestItems,
				guestCartHydrated,
				addGuestItem,
				removeGuestItem,
				updateGuestItemQuantity,
				clearGuestCart,
			}}
		>
			{children}
		</CartContext.Provider>
	);
}
