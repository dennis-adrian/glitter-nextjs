import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SearchIcon } from "lucide-react";

import EnterAsButton from "@/app/components/impersonation/enter-as-button";
import RecentImpersonations from "@/app/components/impersonation/recent-impersonations";
import PageBreadcrumbs from "@/app/components/navbar/page-breadcrumbs";
import {
  listRecentImpersonations,
  searchImpersonationCandidates,
} from "@/app/lib/impersonation/queries";
import { requireAdmin } from "@/app/lib/users/helpers";
import { getProfileStatusLabel, getUserName } from "@/app/lib/users/utils";

export const metadata: Metadata = {
  title: "Entrar como participante",
};

const PAGE_HREF = "/dashboard/impersonate";
const MAX_QUERY_LENGTH = 120;

/**
 * "Entrar como participante": find a participant by name or email and view
 * the app as them, read-only (docs/PLAN-impersonation.md §7.2). Global admins
 * only; festival admins, who open the dashboard too, get a page that does
 * not exist, like every other admin-only page.
 */
export default async function ImpersonatePage(props: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const admin = await requireAdmin();
  if (!admin) notFound();

  const raw = (await props.searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : (raw ?? ""))
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
  const [candidates, recent] = await Promise.all([
    query ? searchImpersonationCandidates(query) : Promise.resolve([]),
    listRecentImpersonations({ adminUserId: admin.id }, 10),
  ]);

  return (
    <div className="container flex max-w-3xl flex-col gap-6 p-3 md:p-6">
      <PageBreadcrumbs />
      <div className="space-y-1">
        <h1 className="text-2xl font-bold md:text-3xl" data-installed-title="">
          Entrar como participante
        </h1>
        <p className="text-sm text-muted-foreground">
          Ver la app como cualquier cuenta. Solo lectura: no se guarda nada.
        </p>
      </div>

      <form
        action={PAGE_HREF}
        method="get"
        role="search"
        className="flex gap-2"
      >
        <label htmlFor="impersonate-query" className="sr-only">
          Buscar por nombre o correo
        </label>
        <input
          id="impersonate-query"
          name="q"
          type="search"
          defaultValue={query}
          maxLength={MAX_QUERY_LENGTH}
          placeholder="Buscar por nombre o correo"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-base md:text-sm"
        />
        <button
          type="submit"
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <SearchIcon aria-hidden="true" className="size-4" />
          Buscar
        </button>
      </form>

      {query ? (
        <section aria-labelledby="impersonate-results" className="space-y-3">
          <h2
            id="impersonate-results"
            className="font-display text-lg font-semibold text-brand-ink"
          >
            Resultados
          </h2>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No encontramos participantes con “{query}”.
            </p>
          ) : (
            <ul className="divide-y divide-brand-border rounded-xl border border-brand-border bg-brand-card">
              {candidates.map((person) => {
                const name = getUserName(person) || person.email;
                const statusLabel = getProfileStatusLabel(person.status);
                return (
                  <li
                    key={person.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-brand-ink">
                        {name}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {person.email} · {statusLabel}
                      </p>
                    </div>
                    <EnterAsButton
                      person={{
                        id: person.id,
                        name,
                        email: person.email,
                        statusLabel,
                      }}
                      returnTo={`${PAGE_HREF}?q=${encodeURIComponent(query)}`}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      <RecentImpersonations
        rows={recent}
        show="subject"
        title="Recientes"
        empty="Todavía no entraste como ningún participante."
      />
    </div>
  );
}
