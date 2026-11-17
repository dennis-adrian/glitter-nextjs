import type { Metadata } from "next";
import { headers } from "next/headers";

import LinksManager from "@/app/dashboard/links/links-manager";
import { listSiteLinksForAdmin } from "@/app/lib/links/actions";
import { LINKS_PATH } from "@/app/lib/links/definitions";
import { fetchLinksSettings } from "@/app/lib/links/queries";
import { publicBaseUrl } from "@/app/lib/urls";

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

export default async function SiteLinksDashboardPage() {
  // The list first: it is what turns away anyone who may not be here.
  const links = await listSiteLinksForAdmin();
  const { socialPosition, header, readAt } = await fetchLinksSettings();
  const publicUrl = `${await requestOrigin()}${LINKS_PATH}`;

  return (
    <div className="container p-4 md:p-6">
      <h1 className="mb-2 text-2xl font-bold" data-installed-title="">
        Enlaces
      </h1>
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Los enlaces de la página que va en la bio de Instagram y TikTok.
        Arrastra para ordenarlos y oculta los que no quieras mostrar por ahora.
      </p>
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
