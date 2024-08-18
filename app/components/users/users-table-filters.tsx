"use client";

import { MultipleSelectCombobox } from "@/app/components/ui/combobox";
import { IncludeAdminsFilter } from "@/app/components/users/filters/include-admins-filter";
import { SearchParamsSchema } from "@/app/dashboard/users/schemas";
import { profileStatusOptions, userCategoryOptions } from "@/app/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";

export default function UsersTableFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const validatedSearchParams = SearchParamsSchema.safeParse({
    includeAdmins: searchParams.get("includeAdmins"),
    status: searchParams.get("status"),
  });
  if (!validatedSearchParams.success) return null;

  const { includeAdmins, status, category } = validatedSearchParams.data;

  const onStatusSelect = (values: string[]) => {
    const currentSearchParams = new URLSearchParams(searchParams.toString());
    currentSearchParams.delete("status");
    values.forEach((value) => {
      currentSearchParams.append("status", value);
    });
    currentSearchParams.set("offset", "0");
    router.push(`?${currentSearchParams.toString()}`);
  };

  const handleShowAdminsChange = (value: boolean) => {
    const currentSearchParams = new URLSearchParams(searchParams.toString());
    currentSearchParams.set("includeAdmins", value.toString());
    router.push(`?${currentSearchParams.toString()}`);
  };

  const handleCategorySelect = (values: string[]) => {
    const currentSearchParams = new URLSearchParams(searchParams.toString());
    currentSearchParams.delete("category");
    values.forEach((value) => {
      currentSearchParams.append("category", value);
    });
    currentSearchParams.set("offset", "0");
    router.push(`?${currentSearchParams.toString()}`);
  };

  return (
    <div className="flex items-center gap-2 my-4">
      <MultipleSelectCombobox
        defaultValue={status}
        label="Estado"
        options={profileStatusOptions}
        onSelect={onStatusSelect}
      />
      <MultipleSelectCombobox
        defaultValue={category}
        label="Categoría"
        options={[
          { value: "none", label: "Sin categoría" },
          ...userCategoryOptions,
        ]}
        onSelect={handleCategorySelect}
      />
      <IncludeAdminsFilter
        checked={!!includeAdmins}
        onCheckedChange={handleShowAdminsChange}
      />
    </div>
  );
}
