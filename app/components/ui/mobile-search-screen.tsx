"use client";

import { type ReactNode, useEffect, useRef } from "react";

import { Loader2, SearchIcon } from "lucide-react";

import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Input } from "@/app/components/ui/input";
import { cn } from "@/app/lib/utils";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/app/components/ui/drawer";
import { type SearchOption } from "@/app/components/ui/search-input/search-content";
import { Button } from "./button";

type MobileSearchMessages = {
	loading?: string;
	empty?: string;
};

type MobileSearchScreenProps<T extends string | number = string | number> = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	searchPlaceholder?: string;
	searchValue: string;
	onSearchValueChange: (value: string) => void;
	options: SearchOption[];
	isLoading?: boolean;
	onSelect: (value: T) => void;
	renderOption?: (option: SearchOption) => ReactNode;
	headerActions?: ReactNode;
	messages?: MobileSearchMessages;
	searchInputId?: string;
};

export default function MobileSearchScreen<T extends string | number>({
	open,
	onOpenChange,
	title,
	searchPlaceholder = "Buscar...",
	searchValue,
	onSearchValueChange,
	options,
	isLoading,
	onSelect,
	renderOption,
	headerActions,
	messages,
	searchInputId = "mobile-search-input",
}: MobileSearchScreenProps<T>) {
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!open) return;
		const raf = requestAnimationFrame(() => {
			inputRef.current?.focus();
		});
		return () => cancelAnimationFrame(raf);
	}, [open]);

	const handleCancel = () => {
		onOpenChange(false);
		onSearchValueChange("");
	};

	return (
		<Drawer direction="bottom" open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="h-dvh p-0 md:hidden data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-dvh data-[vaul-drawer-direction=bottom]:rounded-none">
				<DrawerHeader className="border-b px-4 py-3 text-left space-y-0">
					<div className="flex items-center justify-between gap-2 pr-8">
						<DrawerTitle className="text-base">{title}</DrawerTitle>
						{headerActions}
					</div>
					<DrawerDescription className="sr-only">
						Pantalla de búsqueda en móvil
					</DrawerDescription>
				</DrawerHeader>

				<div className="flex min-h-0 flex-1 flex-col">
					<div className="sticky top-0 z-10 border-b bg-background px-4 py-3 flex items-center justify-between gap-3">
						<div className="relative">
							<SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								ref={inputRef}
								id={searchInputId}
								type="search"
								className="pl-10 text-base"
								placeholder={searchPlaceholder}
								value={searchValue}
								onChange={(e) => onSearchValueChange(e.target.value)}
							/>
						</div>
						<Button
							variant="ghost"
							className="p-0"
							size="sm"
							onClick={handleCancel}
						>
							Cancelar
						</Button>
					</div>

					<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
						{isLoading ? (
							<div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								<span>{messages?.loading ?? "Buscando..."}</span>
							</div>
						) : !options.length ? (
							<p className="p-2 text-sm text-muted-foreground">
								{messages?.empty ?? "No se encontraron resultados"}
							</p>
						) : (
							<ul role="listbox" className="space-y-2 pb-6">
								{options.map((option) => (
									<li key={option.value}>
										<button
											type="button"
											disabled={option.disabled}
											onClick={() => onSelect(option.value as T)}
											className={cn(
												"w-full rounded-lg border p-3 text-left transition-colors",
												"min-h-11",
												option.disabled
													? "cursor-not-allowed opacity-60"
													: "hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
											)}
										>
											{renderOption ? (
												renderOption(option)
											) : (
												<div className="flex items-center justify-between gap-3">
													<div className="min-w-0">
														<p className="truncate font-medium">
															{option.label}
														</p>
														{option.disabledReason ? (
															<p className="text-xs text-muted-foreground">
																{option.disabledReason}
															</p>
														) : null}
													</div>
													{option.imageUrl ? (
														<Avatar className="h-7 w-7 shrink-0">
															<AvatarImage
																alt={option.label}
																src={option.imageUrl}
															/>
														</Avatar>
													) : null}
												</div>
											)}
										</button>
									</li>
								))}
							</ul>
						)}
					</div>
				</div>
			</DrawerContent>
		</Drawer>
	);
}
