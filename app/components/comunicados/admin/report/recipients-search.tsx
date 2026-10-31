"use client";

import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useDebouncedCallback } from "use-debounce";

import { Input } from "@/app/components/ui/input";
import { SpinnerIcon } from "@/app/icons/SpinnerIcon";
import {
  type ComunicadoRecipientFilter,
  comunicadoReportHref,
} from "@/app/lib/comunicados/report-labels";

const SEARCH_DEBOUNCE_MS = 400;
const PLACEHOLDER = "Buscar por nombre o correo";

/**
 * The recipients table's search (G6): it writes `?q=` a moment after the
 * last keystroke, keeping the chip and going back to the first page. It
 * replaces the URL rather than pushing one per search.
 */
export default function RecipientsSearch({
  comunicadoId,
  filter,
  query,
}: {
  comunicadoId: number;
  filter: ComunicadoRecipientFilter;
  query: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const search = useDebouncedCallback((term: string) => {
    startTransition(() => {
      router.replace(
        comunicadoReportHref(comunicadoId, { filter, query: term }),
        { scroll: false },
      );
    });
  }, SEARCH_DEBOUNCE_MS);

  return (
    <div className="relative w-full md:max-w-80">
      <Input
        type="search"
        aria-label={PLACEHOLDER}
        placeholder={PLACEHOLDER}
        defaultValue={query}
        maxLength={100}
        className="pl-10"
        onChange={(event) => search(event.target.value)}
      />
      <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
        {isPending ? (
          <SpinnerIcon aria-hidden className="h-4 w-4 animate-spin" />
        ) : (
          <SearchIcon aria-hidden className="h-4 w-4" />
        )}
      </div>
    </div>
  );
}
