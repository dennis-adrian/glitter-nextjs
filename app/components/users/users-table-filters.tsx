"use client";

import { MultipleSelecteCombobox } from "@/app/components/ui/combobox";
import { profileStatusOptions } from "@/app/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";

export default function UsersTableFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const onStatusSelect = (values: string[]) => {
    const currentSearchParams = new URLSearchParams(searchParams.toString());
    currentSearchParams.delete("status");
    values.forEach((value) => {
      currentSearchParams.append("status", value);
    });
    currentSearchParams.set("offset", "0");
    router.push(`?${currentSearchParams.toString()}`);
  };

  return (
    <div className="my-4">
      <MultipleSelecteCombobox
        label="Estado"
        options={profileStatusOptions}
        onSelect={onStatusSelect}
      />
    </div>
  );
}
