"use client";

import { useState, useTransition } from "react";

import SearchInput from "@/app/components/ui/search-input/input";
import type { SearchOption } from "@/app/components/ui/search-input/search-content";
import { searchDistributionListCandidatesAction } from "@/app/lib/distribution_lists/actions";
import type { DistributionListMember } from "@/app/lib/distribution_lists/definitions";

type Candidate = DistributionListMember & { alreadyMember: boolean };

/**
 * "Agregar por nombre o correo": participants only. Someone who cannot
 * receive messages today can still be added, and says why.
 */
export default function ListMemberSearch({
  listId,
  heldIds,
  onPick,
  disabled = false,
  disabledReason,
}: {
  /** Null while creating: membership is then `heldIds`. */
  listId: number | null;
  /** People already picked on this page, not saved yet. */
  heldIds?: ReadonlySet<number>;
  onPick: (member: DistributionListMember) => void;
  disabled?: boolean;
  /** Why nobody can be added right now, shown on every result. */
  disabledReason?: string;
}) {
  const [results, setResults] = useState<Candidate[]>([]);
  const [isSearching, startSearch] = useTransition();

  const options: SearchOption[] = results.map((result) => {
    const reason =
      result.alreadyMember || heldIds?.has(result.userId)
        ? "Ya está en la lista"
        : disabled
          ? disabledReason
          : undefined;
    return {
      value: result.userId,
      label: result.skipReason
        ? `${result.name} · ${result.email} (no lo recibe ahora: ${result.skipReason})`
        : `${result.name} · ${result.email}`,
      imageUrl: result.imageUrl,
      disabled: reason != null,
      disabledReason: reason,
    };
  });

  return (
    <SearchInput
      id="distribution-list-member-search"
      label="Agregar por nombre o correo"
      labelStyles="sr-only"
      placeholder="Agregá por nombre o correo…"
      options={options}
      isLoading={isSearching}
      minSearchLength={2}
      onSearch={(term) =>
        startSearch(async () => {
          setResults(
            await searchDistributionListCandidatesAction({
              query: term,
              listId: listId ?? undefined,
            }),
          );
        })
      }
      onSelect={(userId) => {
        if (disabled) return;
        const match = results.find((result) => result.userId === userId);
        if (match && !match.alreadyMember && !heldIds?.has(match.userId)) {
          onPick(match);
        }
      }}
    />
  );
}
