"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import SearchInput from "@/app/components/ui/search-input/input";
import type { SearchOption } from "@/app/components/ui/search-input/search-content";
import { searchParticipantsForCreditsAction } from "@/app/lib/credits/actions";

/**
 * Opens anyone's credit account, including someone who has never held
 * credits — the balance list only shows people with history, and a first
 * grant has to start somewhere.
 */
export default function CreditAccountPicker() {
  const router = useRouter();
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [isSearching, startSearch] = useTransition();

  return (
    <div className="w-full sm:w-64">
      <SearchInput
        id="credit-account-picker"
        label="Abrir la cuenta de un participante"
        labelStyles="sr-only"
        placeholder="Abrir cuenta de…"
        options={options}
        isLoading={isSearching}
        onSearch={(term) =>
          startSearch(async () => {
            const rows = await searchParticipantsForCreditsAction(term);
            setOptions(
              rows.map((row) => ({
                value: row.id,
                label: row.label,
                imageUrl: row.imageUrl,
              })),
            );
          })
        }
        onSelect={(userId) =>
          router.push(`/dashboard/credits/accounts/${userId}`)
        }
      />
    </div>
  );
}
