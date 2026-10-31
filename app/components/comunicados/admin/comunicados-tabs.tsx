import Link from "next/link";

import type { ComunicadoTab } from "@/app/lib/comunicados/queries";
import { cn } from "@/lib/utils";

export const COMUNICADO_TABS = [
  "drafts",
  "scheduled",
  "sent",
] as const satisfies readonly ComunicadoTab[];

export const COMUNICADO_TAB_LABELS = {
  drafts: "Borradores",
  scheduled: "Programados",
  sent: "Enviados",
} as const satisfies Record<ComunicadoTab, string>;

const COMUNICADOS_PATH = "/dashboard/communications";

/** `?tab=` as the list reads it: anything else is the drafts. */
export function parseComunicadoTab(value: unknown): ComunicadoTab {
  return COMUNICADO_TABS.find((tab) => tab === value) ?? "drafts";
}

/** The list's own URL: drafts and the first page leave their params out. */
export function comunicadosHref(tab: ComunicadoTab, page = 1) {
  const params = new URLSearchParams();
  if (tab !== "drafts") params.set("tab", tab);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `${COMUNICADOS_PATH}?${search}` : COMUNICADOS_PATH;
}

/**
 * "Borradores (2)" · "Programados (1)" · "Enviados" (G3). Sent ones only
 * grow, so that tab carries no count. Switching goes back to the first page.
 */
export default function ComunicadosTabs({
  tab,
  counts,
}: {
  tab: ComunicadoTab;
  counts: Record<ComunicadoTab, number>;
}) {
  return (
    <nav
      aria-label="Comunicados por estado"
      className="flex shrink-0 gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden"
    >
      {COMUNICADO_TABS.map((value) => {
        const isActive = value === tab;
        return (
          <Link
            key={value}
            href={comunicadosHref(value)}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 py-2 text-sm transition-colors",
              isActive
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {/* One inline run, so the name reads "Borradores (2)". */}
            <span>
              {COMUNICADO_TAB_LABELS[value]}
              {value !== "sent" && (
                <>
                  {" "}
                  <span className="tabular-nums text-muted-foreground">
                    ({counts[value].toLocaleString("es-BO")})
                  </span>
                </>
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
