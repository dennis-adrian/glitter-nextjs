"use client";

import { useEffect, useState } from "react";

import { PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";

import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Button } from "@/app/components/ui/button";
import { Label } from "@/app/components/ui/label";
import MobileSearchScreen from "@/app/components/ui/mobile-search-screen";
import SearchInput from "@/app/components/ui/search-input/input";
import { SearchOption } from "@/app/components/ui/search-input/search-content";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { cn } from "@/app/lib/utils";

type PartnerSelectionProps = {
	options: SearchOption[];
	isRefreshing: boolean;
	isSearching: boolean;
	selectedPartnerId?: number;
	selectedPartner?: SearchOption;
	onPartnerSearch: (term: string) => void;
	onRefreshPartners: () => void;
	onSelectPartner: (partnerId?: number) => void;
};

export default function PartnerSelection({
	options,
	isRefreshing,
	isSearching,
	selectedPartnerId,
	selectedPartner,
	onPartnerSearch,
	onRefreshPartners,
	onSelectPartner,
}: PartnerSelectionProps) {
	const isMobile = useMediaQuery("(max-width: 768px)");
	const [isPartnerSearchOpen, setIsPartnerSearchOpen] = useState(false);
	const [addPartner, setAddPartner] = useState(false);
	const [partnerSearchTerm, setPartnerSearchTerm] = useState("");

	const debouncedPartnerSearch = useDebouncedCallback((term: string) => {
		onPartnerSearch(term);
	}, 300);

	useEffect(() => {
		if (!isPartnerSearchOpen) return;
		debouncedPartnerSearch(partnerSearchTerm);
	}, [partnerSearchTerm, isPartnerSearchOpen, debouncedPartnerSearch]);

	const handleRemovePartner = () => {
		onSelectPartner(undefined);
		if (!isMobile) {
			setAddPartner(false);
		}
	};

	if (selectedPartner) {
		return (
			<div className="rounded-xl border bg-card shadow-sm p-6 mb-3 flex flex-col gap-2">
				<p className="text-sm text-muted-foreground">
					Compartirás espacio con:
				</p>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<Avatar className="w-12 h-12">
							<AvatarImage
								src={selectedPartner?.imageUrl ?? undefined}
								alt="avatar"
							/>
						</Avatar>
						<span className="font-medium">
							{selectedPartner?.label ?? "Compañero seleccionado"}
						</span>
					</div>
					<Button
						variant={isMobile ? "ghost" : "outline"}
						size={isMobile ? "icon" : "default"}
						onClick={handleRemovePartner}
						aria-label="Quitar compañero"
						className="text-destructive bg-card border-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
					>
						{isMobile ? (
							<Trash2Icon className="h-4 w-4" />
						) : (
							<>
								<span>Quitar</span>
								<Trash2Icon className="h-4 w-4 ml-1" />
							</>
						)}
					</Button>
				</div>
			</div>
		);
	}

	if (addPartner && !isMobile) {
		return (
			<div className="rounded-xl border bg-card border-primary shadow-sm p-6 mb-6 flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<Label htmlFor="partner-search">
						Elige a tu compañero de espacio
					</Label>
					<Button
						variant="ghost"
						size="icon"
						className="shrink-0"
						onClick={onRefreshPartners}
						disabled={isRefreshing}
						aria-label="Actualizar lista"
					>
						<RefreshCwIcon
							className={cn("h-4 w-4", isRefreshing && "animate-spin")}
						/>
					</Button>
				</div>

				<SearchInput
					id="partner-search"
					options={options}
					placeholder="Ingresa el nombre..."
					onSearch={onPartnerSearch}
					isLoading={isSearching}
					onSelect={(id) => {
						const parsed = typeof id === "string" ? Number(id) : id;
						onSelectPartner(Number.isFinite(parsed) ? parsed : undefined);
					}}
				/>
			</div>
		);
	}

	return (
		<>
			{!addPartner && !selectedPartner && (
				<div className="w-fit mx-auto">
					<Button
						variant="link"
						onClick={() => {
							if (isMobile) {
								setIsPartnerSearchOpen(true);
								return;
							}

							setAddPartner(true);
						}}
					>
						<PlusIcon className="h-4 w-4 mr-1" />
						Agregar compañero
					</Button>
				</div>
			)}

			<MobileSearchScreen
				open={isPartnerSearchOpen}
				onOpenChange={setIsPartnerSearchOpen}
				title="Buscar compañero"
				searchInputId="partner-search-mobile"
				searchPlaceholder="Ingresa el nombre..."
				searchValue={partnerSearchTerm}
				onSearchValueChange={setPartnerSearchTerm}
				options={partnerSearchTerm.trim() ? options : []}
				isLoading={isSearching}
				headerActions={
					<Button
						variant="ghost"
						size="icon"
						onClick={onRefreshPartners}
						disabled={isRefreshing}
						aria-label="Actualizar lista"
					>
						<RefreshCwIcon
							className={cn("h-4 w-4", isRefreshing && "animate-spin")}
						/>
					</Button>
				}
				messages={{
					empty: partnerSearchTerm.trim()
						? "No se encontraron resultados"
						: "Ingresa un nombre para buscar",
				}}
				onSelect={(value) => {
					const parsed = typeof value === "string" ? Number(value) : value;
					onSelectPartner(Number.isFinite(parsed) ? parsed : undefined);
					setIsPartnerSearchOpen(false);
				}}
			/>
		</>
	);
}
