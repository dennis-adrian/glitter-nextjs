"use client";

import { ComboboxPopover } from "@/app/components/ui/combobox";
import { MultipleSelectCombobox } from "@/app/components/ui/multiselect-combobox";
import Search from "@/app/components/ui/search";
import { IncludeAdminsFilter } from "@/app/components/users/filters/include-admins-filter";
import { SearchParamsSchema } from "@/app/dashboard/users/schemas";
import { profileStatusOptions, userCategoryOptions } from "@/app/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export default function UsersTableFilters() {
	const searchParams = useSearchParams();
	const { push } = useRouter();
	const [isPending, startTransition] = useTransition();

	const defaultValues = {
		includeAdmins: searchParams.get("includeAdmins") || "",
		status: searchParams.get("status") || "",
		category: searchParams.get("category") || "",
		query: searchParams.get("query") || "",
		profileCompletion: searchParams.get("profileCompletion") || "",
	};

	const validatedSearchParams = SearchParamsSchema.safeParse(
		Object.fromEntries(Object.entries(defaultValues).filter(([_, v]) => v)),
	);

	if (!validatedSearchParams.success) return null;

	const { includeAdmins, status, category, profileCompletion } =
		validatedSearchParams.data;

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

	return (
		<div
			className="flex flex-wrap items-center gap-2"
			data-pending={isPending ? "" : undefined}
		>
			<Search placeholder="Buscar..." />
			<ComboboxPopover
				defaultValue={profileCompletion}
				label={"Perfiles a mostrar"}
				name="profileCompletion"
				placeholder="Elige una opción"
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
				label="Categoría"
				name="category"
				options={[
					{ value: "none", label: "Sin categoría" },
					...userCategoryOptions,
				]}
				onSelect={handleFilterSelect}
			/>
			<IncludeAdminsFilter
				checked={!!includeAdmins}
				onCheckedChange={handleShowAdminsChange}
			/>
		</div>
	);
}
