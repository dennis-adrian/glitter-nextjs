import { redirect } from "next/navigation";

import LandingEditor from "@/app/dashboard/landing/landing-editor";
import {
  getLandingDraftOrFallback,
  getLandingPublicationHistory,
  getLandingPublicationMetadata,
} from "@/app/lib/landing_content/data";
import { listLandingFestivalOptions } from "@/app/lib/landing_content/resolve";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

export default async function LandingDashboardPage() {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) redirect("/");
  const [draft, publication, history, festivals] = await Promise.all([
    getLandingDraftOrFallback(),
    getLandingPublicationMetadata(),
    getLandingPublicationHistory(),
    listLandingFestivalOptions(),
  ]);
  return (
    <LandingEditor
      initialContent={draft.content}
      initialVersion={draft.version}
      updatedAt={draft.updatedAt?.toISOString() ?? null}
      publication={
        publication
          ? {
              ...publication,
              publishedAt: publication.publishedAt.toISOString(),
            }
          : null
      }
      history={history.map((item) => ({
        ...item,
        publishedAt: item.publishedAt.toISOString(),
      }))}
      festivals={festivals}
      canPublish={profile.role === "admin"}
    />
  );
}
