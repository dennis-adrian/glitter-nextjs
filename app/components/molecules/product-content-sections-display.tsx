import type { RentalContentSectionSnapshot } from "@/app/lib/rentals/types";
import type { BaseProductContentSection } from "@/app/lib/products/definitions";

type ProductContentSectionsDisplayProps = {
  sections: Array<BaseProductContentSection | RentalContentSectionSnapshot>;
};

export default function ProductContentSectionsDisplay({
  sections,
}: ProductContentSectionsDisplayProps) {
  if (sections.length === 0) return null;

  return (
    <div className="grid gap-4">
      {sections.map((section, index) => (
        <div key={"id" in section ? section.id : `${section.title}-${index}`}>
          <h3 className="text-sm font-semibold">{section.title}</h3>
          {section.format === "free_text" ? (
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
              {section.body}
            </p>
          ) : (
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {(section.items ?? []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
