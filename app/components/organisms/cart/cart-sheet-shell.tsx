"use client";

import { ShoppingCartIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/app/components/ui/sheet";

type CartSheetShellProps = {
	open: boolean;
	onClose: () => void;
	body: ReactNode;
	footer?: ReactNode;
};

export function CartSheetShell({
	open,
	onClose,
	body,
	footer,
}: CartSheetShellProps) {
	return (
		<Sheet open={open} onOpenChange={(next) => !next && onClose()}>
			<SheetContent
				side="right"
				className="flex flex-col w-full sm:max-w-md p-0"
			>
				<SheetHeader className="px-6 py-4 border-b">
					<SheetTitle className="flex items-center gap-2">
						<ShoppingCartIcon className="w-5 h-5" />
						Tu carrito
					</SheetTitle>
					<SheetDescription className="sr-only">
						Productos agregados al carrito.
					</SheetDescription>
				</SheetHeader>

				<div className="min-h-0 flex-1 overflow-y-auto px-6">{body}</div>

				{footer}
			</SheetContent>
		</Sheet>
	);
}
