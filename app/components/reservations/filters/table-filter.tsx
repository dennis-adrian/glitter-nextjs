"use client";

import { ComboboxPopover } from "@/app/components/ui/combobox";
import Search from "@/app/components/ui/search";
import { ReservationsSearchParamsSchema } from "@/app/dashboard/reservations/schemas";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import { getFestivalsOptions } from "@/app/lib/festivals/utils";
import { useRouter, useSearchParams } from "next/navigation";

export default function ReservationsTableFilters({
  festivals,
}: {
  festivals: FestivalBase[];
}) {
  const searchParams = useSearchParams();
  const { replace } = useRouter();
  const festivalOptions = getFestivalsOptions(festivals);

  const defaultValues = {
    includeAdmins: searchParams.get("includeAdmins") || "",
    status: searchParams.get("status") || "",
    category: searchParams.get("category") || "",
    query: searchParams.get("query") || "",
    profileCompletion: searchParams.get("profileCompletion") || "",
  };

  const validatedSearchParams = ReservationsSearchParamsSchema.safeParse(
    Object.fromEntries(Object.entries(defaultValues).filter(([_, v]) => v)),
  );

  if (!validatedSearchParams.success) return null;

  const { festivalId } = validatedSearchParams.data;

  const handleFilterSelect = (filter: string, values: string[]) => {
    const currentSearchParams = new URLSearchParams(searchParams.toString());
    currentSearchParams.delete(filter);
    values.forEach((value) => {
      currentSearchParams.append(filter, value);
    });
    currentSearchParams.set("offset", "0");
    replace(`?${currentSearchParams.toString()}`);
  };

  return (
    <>
      <Search placeholder="Buscar..." />
      <ComboboxPopover
        defaultValue={festivalId?.toString()}
        label="Festival"
        name="festivalId"
        placeholder="Elige una opción"
        options={festivalOptions}
        onSelect={handleFilterSelect}
      />
    </>
  );
}
