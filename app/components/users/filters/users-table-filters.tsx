"use client";

import { ComboboxPopover } from "@/app/components/ui/combobox";
import { MultipleSelectCombobox } from "@/app/components/ui/multiselect-combobox";
import Search from "@/app/components/ui/search";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { IncludeAdminsFilter } from "@/app/components/users/filters/include-admins-filter";
import { SearchParamsSchema } from "@/app/dashboard/users/schemas";
import { profileStatusOptions, userCategoryOptions } from "@/app/lib/utils";
import { SlidersHorizontalIcon, XIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { ReactElement, useState, useTransition } from "react";

export default function UsersTableFilters() {
	const searchParams = useSearchParams();
	const { push } = useRouter();
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	const statusParams = searchParams.getAll("status");
	const categoryParams = searchParams.getAll("category");

	const defaultValues = {
		includeAdmins: searchParams.get("includeAdmins") || undefined,
		status:
			statusParams.length === 0
				? undefined
				: statusParams.length === 1
					? statusParams[0]
					: statusParams,
		category:
			categoryParams.length === 0
				? undefined
				: categoryParams.length === 1
					? categoryParams[0]
					: categoryParams,
		query: searchParams.get("query") || undefined,
		profileCompletion: searchParams.get("profileCompletion") || undefined,
	};

	const validatedSearchParams = SearchParamsSchema.safeParse(defaultValues);

	if (!validatedSearchParams.success) return null;

	const {
		includeAdmins,
		status = [],
		category = [],
		profileCompletion = "all",
	} = validatedSearchParams.data;

	const categoryOptions = [
		{ value: "none", label: "Sin categoria" },
		...userCategoryOptions,
	];
	const profileCompletionOptions = {
		incomplete: "Incompletos",
		complete: "Completos",
		all: "Todos",
	};
	const statusLabelByValue = Object.fromEntries(
		profileStatusOptions.map((option) => [option.value, option.label]),
	);
	const categoryLabelByValue = Object.fromEntries(
		categoryOptions.map((option) => [option.value, option.label]),
	);

	const appliedFilterChips: { key: string; label: string | ReactElement }[] = [
		...(profileCompletion && profileCompletion !== "all"
			? [
					{
						key: "profileCompletion",
						label: (
							<span>
								<span className="font-medium text-[9px] uppercase">
									Perfiles:
								</span>{" "}
								{profileCompletionOptions[profileCompletion]}
							</span>
						),
					},
				]
			: []),
		...(status.length > 0
			? [
					{
						key: "status",
						label: (
							<span>
								<span className="font-medium text-[9px] uppercase">
									Estado:
								</span>{" "}
								{status
									.map(
										(statusValue) =>
											statusLabelByValue[statusValue] || statusValue,
									)
									.join(", ")}
							</span>
						),
					},
				]
			: []),
		...(category.length > 0
			? [
					{
						key: "category",
						label: (
							<span>
								<span className="font-medium text-[9px] uppercase">
									Categoria:
								</span>{" "}
								{category
									.map(
										(categoryValue) =>
											categoryLabelByValue[categoryValue] || categoryValue,
									)
									.join(", ")}
							</span>
						),
					},
				]
			: []),
		...(includeAdmins
			? [{ key: "includeAdmins", label: "Mostrar admins" }]
			: []),
	];

	const handleShowAdminsChange = (value: boolean) => {
		const newSearchParams = new URLSearchParams(searchParams.toString());
		newSearchParams.set("includeAdmins", value.toString());
		startTransition(() => {
			push(`?${newSearchParams.toString()}`, {
				scroll: false,
			});
		});
	};

	const handleFilterSelect = (filter: string, values: string[]) => {
		const newSearchParams = new URLSearchParams(searchParams.toString());
		newSearchParams.delete(filter);
		values.forEach((value) => {
			newSearchParams.append(filter, value);
		});
		newSearchParams.set("offset", "0");
		startTransition(() => {
			push(`?${newSearchParams.toString()}`, {
				scroll: false,
			});
		});
	};

	const handleClearFilter = (filter: string) => {
		const newSearchParams = new URLSearchParams(searchParams.toString());
		newSearchParams.delete(filter);
		newSearchParams.set("offset", "0");
		startTransition(() => {
			push(`?${newSearchParams.toString()}`, {
				scroll: false,
			});
		});
	};

	const filterControls = (
		<>
			<ComboboxPopover
				defaultValue={profileCompletion}
				label={"Perfiles a mostrar"}
				name="profileCompletion"
				placeholder="Elige una opcion"
				options={[
					{ value: "incomplete", label: "Incompletos" },
					{ value: "complete", label: "Completos" },
					{ value: "all", label: "Todos" },
				]}
				onSelect={handleFilterSelect}
			/>
			<MultipleSelectCombobox
				defaultValue={status}
				label="Estado"
				name="status"
				options={profileStatusOptions}
				onSelect={handleFilterSelect}
			/>
			<MultipleSelectCombobox
				defaultValue={category}
				label="Categoria"
				name="category"
				options={categoryOptions}
				onSelect={handleFilterSelect}
			/>
			<IncludeAdminsFilter
				checked={!!includeAdmins}
				onCheckedChange={handleShowAdminsChange}
			/>
		</>
	);

	return (
		<div data-pending={isPending ? "" : undefined}>
			<div className="hidden md:flex md:flex-wrap md:items-center md:gap-2">
				<Search placeholder="Buscar..." />
				{filterControls}
			</div>

			<div className="md:hidden space-y-2">
				<div className="flex items-center gap-2">
					<div className="flex-1 min-w-0">
						<Search placeholder="Buscar..." />
					</div>
					<Button
						type="button"
						variant={filtersOpen ? "default" : "outline"}
						className="shrink-0"
						onClick={() => setFiltersOpen((current) => !current)}
					>
						<SlidersHorizontalIcon className="h-4 w-4 mr-1" />
						Filtros
					</Button>
				</div>

				{filtersOpen ? (
					<div className="flex flex-col gap-2 border rounded-md p-2">
						{filterControls}
					</div>
				) : null}

				{appliedFilterChips.length > 0 && (
					<div className="flex flex-wrap gap-1">
						{appliedFilterChips.map((chip) => (
							<Badge
								key={chip.key}
								variant="outline"
								className="font-normal gap-1 pr-1 border-gray-300 text-gray-800 bg-gray-100"
							>
								<span>{chip.label}</span>
								<button
									type="button"
									aria-label={`Quitar filtro ${chip.label}`}
									className="inline-flex items-center justify-center rounded-full p-0.5 hover:bg-black/10"
									onClick={() => handleClearFilter(chip.key)}
								>
									<XIcon className="h-3 w-3" />
								</button>
							</Badge>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
