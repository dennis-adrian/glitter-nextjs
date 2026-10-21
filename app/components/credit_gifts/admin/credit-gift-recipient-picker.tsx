"use client";

import { XIcon } from "lucide-react";
import { useState, useTransition } from "react";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import SearchInput from "@/app/components/ui/search-input/input";
import type { SearchOption } from "@/app/components/ui/search-input/search-content";
import { searchCreditGiftRecipientsAction } from "@/app/lib/credit_gifts/actions";
import {
  CREDIT_GIFT_MAX_RECIPIENTS,
  type CreditGiftRecipientOption,
} from "@/app/lib/credit_gifts/definitions";

type CreditGiftRecipientPickerProps = {
  recipients: CreditGiftRecipientOption[];
  onAdd: (recipient: CreditGiftRecipientOption) => void;
  onRemove: (userId: number) => void;
  disabled?: boolean;
};

/**
 * Search, add, repeat. People who could not receive the gift appear in the
 * results disabled, with the reason, instead of silently missing.
 */
export default function CreditGiftRecipientPicker({
  recipients,
  onAdd,
  onRemove,
  disabled = false,
}: CreditGiftRecipientPickerProps) {
  const [results, setResults] = useState<CreditGiftRecipientOption[]>([]);
  const [isSearching, startSearch] = useTransition();
  const selectedIds = new Set(recipients.map((recipient) => recipient.id));
  const full = recipients.length >= CREDIT_GIFT_MAX_RECIPIENTS;

  const options: SearchOption[] = results.map((result) => {
    const reason = selectedIds.has(result.id)
      ? "Ya está en la lista"
      : full
        ? `Máximo ${CREDIT_GIFT_MAX_RECIPIENTS} personas por regalo`
        : result.skipReason;
    return {
      value: result.id,
      label: `${result.name} · ${result.email}`,
      imageUrl: result.imageUrl,
      disabled: reason != null,
      disabledReason: reason ?? undefined,
    };
  });

  return (
    <div className="space-y-3">
      <SearchInput
        id="credit-gift-recipient-search"
        label="Buscar participantes"
        labelStyles="sr-only"
        placeholder="Buscá por nombre o correo…"
        options={options}
        isLoading={isSearching}
        onSearch={(term) =>
          startSearch(async () => {
            setResults(await searchCreditGiftRecipientsAction(term));
          })
        }
        onSelect={(userId) => {
          if (disabled) return;
          const match = results.find((result) => result.id === userId);
          if (
            match &&
            !match.skipReason &&
            !selectedIds.has(match.id) &&
            !full
          ) {
            onAdd(match);
          }
        }}
      />

      {recipients.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no agregaste a nadie.
        </p>
      ) : (
        <ul
          className="flex flex-wrap gap-2"
          aria-label="Participantes elegidos"
        >
          {recipients.map((recipient) => (
            <li
              key={recipient.id}
              className="flex max-w-full items-center gap-1.5 rounded-full border bg-background py-1 pl-3 pr-1 text-sm"
            >
              <span className="truncate">{recipient.name}</span>
              {recipient.skipReason && (
                <Badge variant="amber" size="sm">
                  {recipient.skipReason}
                </Badge>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full"
                disabled={disabled}
                onClick={() => onRemove(recipient.id)}
                aria-label={`Quitar a ${recipient.name}`}
              >
                <XIcon className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        {recipients.length} de {CREDIT_GIFT_MAX_RECIPIENTS} como máximo.
      </p>
    </div>
  );
}
