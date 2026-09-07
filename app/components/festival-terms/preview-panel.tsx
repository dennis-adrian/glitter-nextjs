"use client";

import { useId } from "react";
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
  FestivalTermsSection,
  TermsAudienceCategory,
  TermsFestivalType,
} from "@/app/lib/festival-terms/definitions";
import { cn } from "@/app/lib/utils";

type FestivalTermsPreviewPanelProps = {
  sections: FestivalTermsSection[];
  category: TermsAudienceCategory;
  festivalType: TermsFestivalType;
  onCategoryChange: (value: TermsAudienceCategory) => void;
  onFestivalTypeChange: (value: TermsFestivalType) => void;
  hint?: string;
  className?: string;
  documentClassName?: string;
};

export default function FestivalTermsPreviewPanel({
  sections,
  category,
  festivalType,
  onCategoryChange,
  onFestivalTypeChange,
  hint,
  className,
  documentClassName,
}: FestivalTermsPreviewPanelProps) {
  const categorySelectId = useId();
  const festivalTypeSelectId = useId();

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={categorySelectId}>Categoría</Label>
          <Select
            value={category}
            onValueChange={(value) =>
              onCategoryChange(value as TermsAudienceCategory)
            }
          >
            <SelectTrigger id={categorySelectId} className="w-full">
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
          <Label htmlFor={festivalTypeSelectId}>Tipo de festival</Label>
          <Select
            value={festivalType}
            onValueChange={(value) =>
              onFestivalTypeChange(value as TermsFestivalType)
            }
          >
            <SelectTrigger id={festivalTypeSelectId} className="w-full">
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
      {hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      <div
        className={cn(
          "min-h-0 flex-1 overflow-auto rounded-lg border p-3 sm:p-4",
          documentClassName,
        )}
      >
        <FestivalTermsDocument
          sections={sections}
          category={category}
          festival={{
            festivalType,
            festivalDates: [],
          }}
          schedulePlaceholder
        />
      </div>
    </div>
  );
}
