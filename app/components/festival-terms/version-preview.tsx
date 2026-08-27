"use client";

import { useState } from "react";

import FestivalTermsDocument from "@/app/components/festival-terms/document";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import {
  TERMS_AUDIENCE_CATEGORIES,
  TERMS_FESTIVAL_TYPES,
} from "@/app/lib/festival-terms/constants";
import {
  CATEGORY_LABELS,
  FESTIVAL_TYPE_LABELS,
} from "@/app/lib/festival-terms/copy";
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
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1.5">
          <Label>Categoría</Label>
          <Select
            value={category}
            onValueChange={(value) =>
              setCategory(value as TermsAudienceCategory)
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERMS_AUDIENCE_CATEGORIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {CATEGORY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tipo de festival</Label>
          <Select
            value={festivalType}
            onValueChange={(value) =>
              setFestivalType(value as TermsFestivalType)
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERMS_FESTIVAL_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {FESTIVAL_TYPE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <FestivalTermsDocument
        sections={version.sections}
        category={category}
        festival={{ festivalType, festivalDates: [] }}
        schedulePlaceholder
      />
    </div>
  );
}
