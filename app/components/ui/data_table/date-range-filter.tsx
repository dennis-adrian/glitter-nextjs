"use client";

import { CalendarIcon, ChevronDownIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import { formatDisplayDate } from "@/app/lib/formatters";
import { cn } from "@/lib/utils";
import {
  toolbarButtonActiveClass,
  toolbarButtonClass,
} from "@/app/components/ui/data_table/styles";

/** A `YYYY-MM-DD` read as that calendar day, not UTC midnight shifted a day back. */
function dayLabel(value: string) {
  return formatDisplayDate(`${value}T12:00:00`, {
    day: "numeric",
    month: "short",
  });
}

/**
 * An inclusive range of days for a server-paged table, in the URL as `from`
 * and `to` (`YYYY-MM-DD`). Sits in the table's toolbar beside the facet
 * filters and reads like them: the name, then what is chosen.
 */
export function DataTableDateRangeFilter({
  label = "Fecha",
}: {
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const active = Boolean(from || to);

  function set(key: "from" | "to", value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("offset");
    if (value) params.set(key, value);
    else params.delete(key);
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  const summary =
    from && to
      ? from === to
        ? dayLabel(from)
        : `${dayLabel(from)} – ${dayLabel(to)}`
      : from
        ? `desde ${dayLabel(from)}`
        : to
          ? `hasta ${dayLabel(to)}`
          : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            toolbarButtonClass,
            active && toolbarButtonActiveClass,
            isPending && "opacity-70",
          )}
        >
          <CalendarIcon className="h-4 w-4 opacity-60" aria-hidden />
          <span className={cn(active && "text-muted-foreground")}>
            {label}
            {active && ":"}
          </span>
          {summary && <span className="font-medium">{summary}</span>}
          <ChevronDownIcon
            className="ml-0.5 h-4 w-4 shrink-0 opacity-50"
            aria-hidden
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="start">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Desde
          <Input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => set("from", event.target.value || null)}
            className="h-9"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Hasta
          <Input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => set("to", event.target.value || null)}
            className="h-9"
          />
        </label>
        {active && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.delete("from");
              params.delete("to");
              params.delete("offset");
              const query = params.toString();
              startTransition(() => {
                router.push(query ? `${pathname}?${query}` : pathname, {
                  scroll: false,
                });
              });
            }}
          >
            Quitar fechas
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
