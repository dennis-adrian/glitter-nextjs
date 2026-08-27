import type {
  EditorTermsSection,
  FestivalTermsSection,
} from "@/app/lib/festival-terms/definitions";

export function toEditorSections(
  sections: FestivalTermsSection[],
): EditorTermsSection[] {
  return [...sections]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((section) => ({
      clientId: `section-${section.id}`,
      kind: section.kind,
      layout: section.layout,
      title: section.title ?? "",
      bodyJson: Array.isArray(section.bodyJson)
        ? (section.bodyJson as unknown[])
        : null,
      bodyHtml: section.bodyHtml,
      audienceCategories: Array.isArray(section.audienceCategories)
        ? section.audienceCategories.filter(
            (value): value is EditorTermsSection["audienceCategories"][number] =>
              value === "illustration" ||
              value === "gastronomy" ||
              value === "entrepreneurship",
          )
        : [],
      audienceFestivalTypes: Array.isArray(section.audienceFestivalTypes)
        ? section.audienceFestivalTypes.filter(
            (value): value is EditorTermsSection["audienceFestivalTypes"][number] =>
              value === "glitter" ||
              value === "twinkler" ||
              value === "festicker",
          )
        : [],
    }));
}

export function createEmptyEditorSection(): EditorTermsSection {
  return {
    clientId:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `section-${Date.now()}-${Math.random()}`,
    kind: "rich_text",
    layout: "plain",
    title: "",
    bodyJson: null,
    bodyHtml: null,
    audienceCategories: [],
    audienceFestivalTypes: [],
  };
}
