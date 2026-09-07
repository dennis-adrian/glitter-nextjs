"use client";

import { XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/app/components/ui/badge";
import { Input } from "@/app/components/ui/input";
import type { PostCategoryRow } from "@/app/lib/posts/definitions";
import { cn } from "@/app/lib/utils";

type Props = {
  categories: PostCategoryRow[];
  activeCategory?: string;
  activeTag?: string;
  q: string;
};

/**
 * Search plus category chips, kept in the query string so a filtered view is
 * a shareable URL and the back button behaves.
 *
 * Filters compose: picking a category keeps the current search, and clearing
 * one leaves the other in place — the previous version dropped everything
 * because `/blog` only ever read `q`.
 */
export default function BlogFilters({
  categories,
  activeCategory,
  activeTag,
  q,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(q);

  function hrefWith(next: Record<string, string | undefined>): string {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, val] of Object.entries(next)) {
      if (val) params.set(key, val);
      else params.delete(key);
    }
    // Any filter change restarts paging; page 4 of the old result set is
    // meaningless against the new one.
    params.delete("page");
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    router.push(hrefWith({ q: value.trim() || undefined }));
  }

  const hasFilters = Boolean(q || activeCategory || activeTag);

  return (
    <div className="mb-8 grid gap-4">
      <form onSubmit={submitSearch}>
        <Input
          name="q"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Buscar artículos…"
          className="max-w-md"
        />
      </form>

      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={hrefWith({ category: undefined })}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              activeCategory
                ? "text-muted-foreground hover:bg-muted"
                : "border-primary bg-primary/10 font-medium text-primary",
            )}
          >
            Todas
          </Link>
          {categories.map((category) => {
            const active = activeCategory === category.slug;
            return (
              <Link
                key={category.id}
                href={hrefWith({
                  category: active ? undefined : category.slug,
                })}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  active
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {category.name}
              </Link>
            );
          })}
        </div>
      )}

      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {activeTag && (
            <Badge variant="secondary" className="gap-1">
              #{activeTag}
              <Link
                href={hrefWith({ tag: undefined })}
                aria-label="Quitar etiqueta"
              >
                <XIcon className="size-3" />
              </Link>
            </Badge>
          )}
          {q && (
            <Badge variant="secondary" className="gap-1">
              “{q}”
              <Link
                href={hrefWith({ q: undefined })}
                aria-label="Quitar búsqueda"
              >
                <XIcon className="size-3" />
              </Link>
            </Badge>
          )}
          <Link
            href={pathname}
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Limpiar filtros
          </Link>
        </div>
      )}
    </div>
  );
}
