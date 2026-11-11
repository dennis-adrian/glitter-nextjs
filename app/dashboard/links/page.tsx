import type { Metadata } from "next";

import LinksManager from "@/app/dashboard/links/links-manager";
import { listSiteLinksForAdmin } from "@/app/lib/links/actions";
import { LINKS_PATH } from "@/app/lib/links/definitions";
import { fetchSocialPosition } from "@/app/lib/links/queries";
import { publicBaseUrl } from "@/app/lib/urls";

export const metadata: Metadata = { title: "Enlaces" };

export default async function SiteLinksDashboardPage() {
  // The list first: it is what turns away anyone who may not be here.
  const links = await listSiteLinksForAdmin();
  const socialPosition = await fetchSocialPosition();
  const publicUrl = `${publicBaseUrl()}${LINKS_PATH}`;

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
        publicUrl={publicUrl}
      />
    </div>
  );
}
