import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import LinksManager from "@/app/dashboard/links/links-manager";
import LinksStatistics, {
  statisticsHref,
} from "@/app/dashboard/links/links-statistics";
import { listSiteLinksForAdmin } from "@/app/lib/links/actions";
import { LINKS_ADMIN_PATH, LINKS_PATH } from "@/app/lib/links/definitions";
import { fetchLinksSettings } from "@/app/lib/links/queries";
import { toStatsPeriod } from "@/app/lib/links/statistics";
import { fetchLinksStatistics } from "@/app/lib/links/statistics-queries";
import { publicBaseUrl } from "@/app/lib/urls";
import { cn } from "@/app/lib/utils";

export const metadata: Metadata = { title: "Enlaces" };

/**
 * The origin this request came to, so the address shown is the one of the
 * domain the admin is on (production, staging or a preview) and not the one
 * configured for emails.
 */
async function requestOrigin() {
  const requestHeaders = await headers();
  const host = (
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  )
    ?.split(",")[0]
    ?.trim();
  if (!host) return publicBaseUrl();
  const proto =
    requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

const VIEW_TAB_CLASS =
  "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** The editor and the statistics, one at a time, each at its own address. */
function ViewTabs({
  statistics,
  period,
}: {
  statistics: boolean;
  period: number;
}) {
  const tabs = [
    { label: "Editar", href: LINKS_ADMIN_PATH, current: !statistics },
    {
      label: "Estadísticas",
      href: statisticsHref(period),
      current: statistics,
    },
  ];
  return (
    <nav aria-label="Secciones de enlaces" className="mb-6 flex gap-2 border-b">
      {tabs.map((tab) => (
        <Link
          key={tab.label}
          href={tab.href}
          aria-current={tab.current ? "page" : undefined}
          className={cn(
            VIEW_TAB_CLASS,
            tab.current
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

export default async function SiteLinksDashboardPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // The list first: it is what turns away anyone who may not be here.
  const links = await listSiteLinksForAdmin();
  const searchParams = await props.searchParams;
  const showStatistics = searchParams.vista === "estadisticas";
  const period = toStatsPeriod(searchParams.periodo);

  const intro = (
    <>
      <h1 className="mb-2 text-2xl font-bold" data-installed-title="">
        Enlaces
      </h1>
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Los enlaces de la página que va en la bio de Instagram y TikTok.
        Arrastra para ordenarlos y oculta los que no quieras mostrar por ahora.
      </p>
    </>
  );

  if (showStatistics) {
    const stats = await fetchLinksStatistics(period);
    if (!stats) redirect("/");
    return (
      <div className="container p-4 md:p-6">
        {intro}
        <ViewTabs statistics period={period} />
        <div className="max-w-5xl">
          <LinksStatistics stats={stats} />
        </div>
      </div>
    );
  }

  const { socialPosition, header, readAt } = await fetchLinksSettings();
  const publicUrl = `${await requestOrigin()}${LINKS_PATH}`;

  return (
    <div className="container p-4 md:p-6">
      {intro}
      <ViewTabs statistics={false} period={period} />
      <LinksManager
        initialLinks={links}
        initialSocialPosition={socialPosition}
        initialHeader={header}
        now={readAt}
        publicUrl={publicUrl}
      />
    </div>
  );
}
