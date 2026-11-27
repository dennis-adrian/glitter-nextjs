import type { Metadata } from "next";

import CulturalActivityWizard from "@/app/components/cultural-activities/cultural-activity-wizard";
import {
  categoryFromTipo,
  CULTURAL_ACTIVITY_APPLY_PATH,
  CULTURAL_ACTIVITY_COPY,
} from "@/app/lib/live_acts/definitions";

export const metadata: Metadata = {
  title: CULTURAL_ACTIVITY_COPY.applyTitle,
  description: CULTURAL_ACTIVITY_COPY.metaDescription,
  alternates: { canonical: CULTURAL_ACTIVITY_APPLY_PATH },
  robots: { index: false },
};

/**
 * The postulation form, on its own page with no site navigation
 * (`data-bare-page`). Always open. `?tipo=taller` (from a landing card)
 * starts with that type chosen.
 */
export default async function CulturalActivityApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { tipo } = await searchParams;
  const initialCategory = categoryFromTipo(tipo);

  return (
    <div data-bare-page="">
      <CulturalActivityWizard
        key={initialCategory ?? "none"}
        initialCategory={initialCategory}
      />
    </div>
  );
}
