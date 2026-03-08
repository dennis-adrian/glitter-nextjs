"use client";

import { createContext, useCallback, useContext, useState } from "react";

type CartContextValue = {
	itemCount: number;
	setItemCount: (n: number) => void;
	isOpen: boolean;
	openCart: () => void;
	closeCart: () => void;
};

const CartContext = createContext<CartContextValue>({
	itemCount: 0,
	setItemCount: () => {},
	isOpen: false,
	openCart: () => {},
	closeCart: () => {},
});

export function useCart() {
	return useContext(CartContext);
}

export function CartProvider({
	initialItemCount,
	children,
}: {
	initialItemCount: number;
	children: React.ReactNode;
}) {
	const [itemCount, setItemCount] = useState(initialItemCount);
	const [isOpen, setIsOpen] = useState(false);

	const openCart = useCallback(() => setIsOpen(true), []);
	const closeCart = useCallback(() => setIsOpen(false), []);

	return (
		<CartContext.Provider
			value={{ itemCount, setItemCount, isOpen, openCart, closeCart }}
		>
			{children}
		</CartContext.Provider>
	);
}
