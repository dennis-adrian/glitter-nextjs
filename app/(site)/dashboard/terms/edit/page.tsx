import { redirect } from "next/navigation";

import FestivalTermsEditor from "@/app/components/festival-terms/admin-editor";
import {
  getOrCreateFestivalTermsDraft,
} from "@/app/lib/festival-terms/actions";
import { toEditorSections } from "@/app/lib/festival-terms/editor";
import { countStaleActiveFestivalAcceptances } from "@/app/lib/festival-terms/queries";
import { requireAdmin } from "@/app/lib/users/helpers";

export default async function FestivalTermsEditPage() {
  const profile = await requireAdmin();
  if (!profile) {
    redirect("/dashboard");
  }

  const result = await getOrCreateFestivalTermsDraft();
  if (!result.success) {
    redirect("/dashboard/terms");
  }

  const draft = result.draft;
  const staleAcceptanceCount = await countStaleActiveFestivalAcceptances(
    draft.id,
  );

  return (
    <div className="container p-4 md:p-6">
      <FestivalTermsEditor
        draft={draft}
        initialSections={toEditorSections(draft.sections)}
        staleAcceptanceCount={staleAcceptanceCount}
      />
    </div>
  );
}
