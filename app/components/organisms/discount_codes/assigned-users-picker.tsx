"use client";

import { XIcon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Button } from "@/app/components/ui/button";
import SearchInput from "@/app/components/ui/search-input/input";
import type { SearchOption } from "@/app/components/ui/search-input/search-content";
import { searchDiscountCodeUsers } from "@/app/lib/discount_codes/actions";
import type { DiscountCodeUser } from "@/app/lib/discount_codes/definitions";
import { getUserName } from "@/app/lib/users/utils";

type AssignedUsersPickerProps = {
  value: DiscountCodeUser[];
  onChange: (users: DiscountCodeUser[]) => void;
  max: number;
};

function displayName(user: DiscountCodeUser) {
  return getUserName(user) || user.email;
}

/**
 * Adds people one search at a time and lists who is in, each removable.
 *
 * Searches on the server rather than filtering a list shipped with the page:
 * the single-user picker this replaces loaded every account, with all its
 * participations and tags, just to show a name and an email.
 */
export default function AssignedUsersPicker({
  value,
  onChange,
  max,
}: AssignedUsersPickerProps) {
  const [results, setResults] = useState<DiscountCodeUser[]>([]);
  const [isSearching, startSearch] = useTransition();
  // Answers can come back out of order; only the latest term's may land.
  const latestTerm = useRef("");
  const selectedIds = new Set(value.map((user) => user.id));

  const options: SearchOption[] = results.map((user) => {
    const taken = selectedIds.has(user.id);
    return {
      value: user.id,
      label: `${displayName(user)} · ${user.email}`,
      imageUrl: user.imageUrl,
      disabled: taken,
      disabledReason: taken ? "Ya está en la lista" : undefined,
    };
  });

  function search(term: string) {
    latestTerm.current = term;
    if (term.length < 2) {
      setResults([]);
      return;
    }
    startSearch(async () => {
      const rows = await searchDiscountCodeUsers(term);
      if (latestTerm.current === term) setResults(rows);
    });
  }

  function add(userId: number) {
    const user = results.find((row) => row.id === userId);
    if (!user || selectedIds.has(userId)) return;
    if (value.length >= max) {
      toast.warning(`Un código puede reservarse para hasta ${max} usuarios.`);
      return;
    }
    onChange([...value, user]);
  }

  return (
    <div className="grid gap-2">
      <SearchInput
        id="discount-code-users"
        placeholder="Buscar por nombre, correo o #id"
        options={options}
        isLoading={isSearching}
        contentMaxHeightClassName="max-h-72"
        onSearch={search}
        onSelect={add}
      />
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no agregaste a nadie.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {value.length === 1
                ? "1 usuario puede usarlo"
                : `${value.length} usuarios pueden usarlo`}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={() => onChange([])}
            >
              Quitar todos
            </Button>
          </div>
          <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
            {value.map((user) => (
              <li key={user.id} className="flex items-center gap-3 px-3 py-2">
                <Avatar className="h-8 w-8 border-0">
                  <AvatarImage alt="" src={user.imageUrl} sizes="32px" />
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{displayName(user)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground"
                  aria-label={`Quitar a ${displayName(user)}`}
                  onClick={() =>
                    onChange(value.filter((entry) => entry.id !== user.id))
                  }
                >
                  <XIcon className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
