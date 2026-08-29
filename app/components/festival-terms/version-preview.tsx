"use client";

import { useState } from "react";

import FestivalTermsPreviewPanel from "@/app/components/festival-terms/preview-panel";
import type {
  FestivalTermsVersionWithSections,
  TermsAudienceCategory,
  TermsFestivalType,
} from "@/app/lib/festival-terms/definitions";

export default function FestivalTermsVersionPreview({
  version,
}: {
  version: FestivalTermsVersionWithSections;
}) {
  const [category, setCategory] =
    useState<TermsAudienceCategory>("illustration");
  const [festivalType, setFestivalType] =
    useState<TermsFestivalType>("glitter");

  return (
    <FestivalTermsPreviewPanel
      sections={version.sections}
      category={category}
      festivalType={festivalType}
      onCategoryChange={setCategory}
      onFestivalTypeChange={setFestivalType}
      documentClassName="max-h-none border-0 p-0"
    />
  );
}
