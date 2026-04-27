"use client";

import { type ReactNode, useEffect, useRef } from "react";

import { Loader2Icon, SearchIcon, XIcon } from "lucide-react";

import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Button } from "@/app/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/app/components/ui/drawer";
import { Input } from "@/app/components/ui/input";
import { type SearchOption } from "@/app/components/ui/search-input/search-content";
import { cn } from "@/app/lib/utils";

type MobileSearchMessages = {
	loading?: string;
	empty?: string;
};

type MobileSearchSharedProps<T extends string | number = string | number> = {
	headerActions?: ReactNode;
	isLoading?: boolean;
	options: SearchOption[];
	messages?: MobileSearchMessages;
	renderOption?: (option: SearchOption) => ReactNode;
	onSelect: (value: T) => void;
};

type MobileSearchScreenProps<T extends string | number = string | number> =
	MobileSearchSharedProps<T> & {
		open: boolean;
		searchInputId?: string;
		searchPlaceholder?: string;
		searchValue: string;
		suggestedOptions?: SearchOption[];
		title: string;
		onOpenChange: (open: boolean) => void;
		onSearchValueChange: (value: string) => void;
	};

export default function MobileSearchScreen<T extends string | number>({
	headerActions,
	isLoading,
	open,
	messages,
	options,
	renderOption,
	searchInputId = "mobile-search-input",
	searchPlaceholder = "Buscar...",
	searchValue,
	suggestedOptions,
	title,
	onOpenChange,
	onSearchValueChange,
	onSelect,
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

	const handleSelect = (value: T) => {
		onSelect(value);
		onSearchValueChange("");
	};

	return (
		<Drawer direction="bottom" open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="h-dvh p-0 md:hidden data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-dvh data-[vaul-drawer-direction=bottom]:rounded-none">
				<DrawerHeader className="border-b px-4 py-3 text-left space-y-0">
					<div className="flex items-center justify-between gap-2 pr-8">
						<DrawerTitle>
							<span className="font-semibold font-space-grotesk text-lg">
								{title}
							</span>
						</DrawerTitle>
					</div>
					<DrawerDescription className="sr-only">
						Pantalla de búsqueda en móvil
					</DrawerDescription>
				</DrawerHeader>

				<div className="flex min-h-0 flex-1 flex-col">
					<div className="sticky top-0 z-10 border-b bg-background px-4 py-3 flex items-center justify-between gap-3">
						<div className="relative w-full">
							<SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								ref={inputRef}
								id={searchInputId}
								type="search"
								className="pl-10 pr-10 text-base"
								placeholder={searchPlaceholder}
								value={searchValue}
								onChange={(e) => onSearchValueChange(e.target.value)}
							/>
							{searchValue ? (
								<button
									type="button"
									aria-label="Limpiar búsqueda"
									className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									onClick={() => {
										onSearchValueChange("");
										inputRef.current?.focus();
									}}
								>
									<XIcon className="h-4 w-4" />
								</button>
							) : null}
						</div>
						<Button
							variant="ghost"
							className="p-0 shrink-0"
							size="sm"
							onClick={handleCancel}
						>
							Cancelar
						</Button>
					</div>

					<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
						{suggestedOptions?.length && !searchValue ? (
							<MobileSearchScreenSuggestedOptions
								options={suggestedOptions ?? []}
								onSelect={handleSelect}
							/>
						) : (
							<MobileSearchScreenContent
								headerActions={headerActions}
								isLoading={isLoading}
								messages={messages}
								options={options}
								renderOption={renderOption}
								onSelect={handleSelect}
							/>
						)}
					</div>
				</div>
			</DrawerContent>
		</Drawer>
	);
}

function MobileSearchScreenOption({ option }: { option: SearchOption }) {
	return (
		<div className="flex items-center gap-3">
			{option.imageUrl ? (
				<Avatar className="h-14 w-14 shrink-0">
					<AvatarImage alt={option.label} src={option.imageUrl} />
				</Avatar>
			) : null}
			<div className="min-w-0">
				<p className="truncate text-sm font-medium">{option.label}</p>
				{option.disabledReason ? (
					<p className="text-xs text-muted-foreground">
						{option.disabledReason}
					</p>
				) : null}
			</div>
		</div>
	);
}

function MobileSearchScreenContent<T extends string | number>({
	headerActions,
	isLoading,
	messages,
	options,
	onSelect,
	renderOption,
}: MobileSearchSharedProps<T>) {
	if (isLoading) {
		return (
			<div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
				<Loader2Icon className="h-4 w-4 animate-spin" />
				<span>{messages?.loading ?? "Buscando..."}</span>
			</div>
		);
	}

	if (!options.length) {
		return (
			<p className="p-2 text-sm text-muted-foreground">
				{messages?.empty ?? "No se encontraron resultados"}
			</p>
		);
	}

	return (
		<div>
			<div className="flex items-center justify-between gap-2 mb-2">
				<h3 className="text-sm font-medium">Resultados de la búsqueda</h3>
				{headerActions}
			</div>
			<ul role="listbox" className="flex flex-col gap-2 pb-6">
				{options.map((option) => (
					<li key={option.value}>
						<button
							type="button"
							disabled={option.disabled}
							onClick={() => onSelect(option.value as T)}
							className={cn(
								"w-full text-left p-2 rounded-lg transition-colors",
								"min-h-11",
								option.disabled
									? "cursor-not-allowed opacity-60"
									: "hover:ring-1 hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							)}
						>
							{renderOption ? (
								renderOption(option)
							) : (
								<MobileSearchScreenOption option={option} />
							)}
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}

function MobileSearchScreenSuggestedOptions<T extends string | number>({
	options,
	onSelect,
}: {
	options: SearchOption[];
	onSelect: (value: T) => void;
}) {
	return (
		<div>
			<div className="flex items-center justify-between gap-2 mb-2">
				<h3 className="text-sm font-medium">
					Compartiste espacio anteriormente
				</h3>
			</div>
			<ul role="listbox" className="flex flex-col gap-2 pb-6">
				{options.map((option) => (
					<li key={option.value}>
						<button
							type="button"
							disabled={option.disabled}
							onClick={() => onSelect(option.value as T)}
							className={cn(
								"w-full text-left p-2 rounded-lg transition-colors",
								"min-h-11",
								option.disabled
									? "cursor-not-allowed opacity-60"
									: "hover:ring-1 hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							)}
						>
							<MobileSearchScreenOption option={option} />
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}
