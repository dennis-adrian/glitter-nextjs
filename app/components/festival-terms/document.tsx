import FestivalTermsSchedule from "@/app/components/festival-terms/schedule";
import RichTextHtml from "@/app/components/molecules/rich-text-html";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import type { UserCategory } from "@/app/api/users/definitions";
import { filterSectionsForAudience } from "@/app/lib/festival-terms/audience";
import type { FestivalTermsSection } from "@/app/lib/festival-terms/definitions";
import type { FestivalWithDates } from "@/app/lib/festivals/definitions";

type FestivalTermsDocumentProps = {
  sections: FestivalTermsSection[];
  category: Exclude<UserCategory, "none">;
  festival: Pick<FestivalWithDates, "festivalType" | "festivalDates">;
  schedulePlaceholder?: boolean;
};

type RenderGroup =
  | { type: "plain"; section: FestivalTermsSection }
  | { type: "card"; section: FestivalTermsSection }
  | { type: "accordion"; sections: FestivalTermsSection[] };

function groupVisibleSections(
  sections: FestivalTermsSection[],
): RenderGroup[] {
  const groups: RenderGroup[] = [];
  for (const section of sections) {
    if (section.layout === "accordion") {
      const last = groups[groups.length - 1];
      if (last?.type === "accordion") {
        last.sections.push(section);
      } else {
        groups.push({ type: "accordion", sections: [section] });
      }
      continue;
    }
    if (section.layout === "card") {
      groups.push({ type: "card", section });
      continue;
    }
    groups.push({ type: "plain", section });
  }
  return groups;
}

function SectionBody({
  section,
  festival,
  category,
  schedulePlaceholder,
}: {
  section: FestivalTermsSection;
  festival: Pick<FestivalWithDates, "festivalType" | "festivalDates">;
  category: Exclude<UserCategory, "none">;
  schedulePlaceholder?: boolean;
}) {
  if (section.kind === "schedule") {
    if (schedulePlaceholder) {
      return (
        <p className="text-sm text-muted-foreground">
          Los horarios de ingreso, montaje y desmontaje se calculan
          automáticamente con las fechas de cada festival.
        </p>
      );
    }
    return (
      <FestivalTermsSchedule festival={festival} category={category} />
    );
  }
  return (
    <RichTextHtml
      html={section.bodyHtml}
      className="[&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h4]:mb-1 [&_h4]:font-semibold [&_mark]:rounded [&_mark]:bg-amber-100 [&_mark]:px-1 [&_mark]:py-0.5 [&_mark]:font-medium"
    />
  );
}

export default function FestivalTermsDocument({
  sections,
  category,
  festival,
  schedulePlaceholder = false,
}: FestivalTermsDocumentProps) {
  const visible = filterSectionsForAudience(
    sections,
    category,
    festival.festivalType,
  );
  const groups = groupVisibleSections(visible);

  return (
    <div className="flex flex-col gap-3 md:gap-4">
      {groups.map((group, groupIndex) => {
        if (group.type === "accordion") {
          const defaultOpen = group.sections
            .slice(0, 3)
            .map((section, index) => `terms-acc-${groupIndex}-${index}`);
          return (
            <Accordion
              key={`acc-${groupIndex}`}
              type="multiple"
              className="w-full"
              defaultValue={defaultOpen}
            >
              {group.sections.map((section, index) => (
                <AccordionItem
                  key={section.id ?? `acc-item-${groupIndex}-${index}`}
                  value={`terms-acc-${groupIndex}-${index}`}
                >
                  <AccordionTrigger className="text-lg md:text-xl font-semibold font-space-grotesk tracking-wide">
                    {section.title || "Sección"}
                  </AccordionTrigger>
                  <AccordionContent>
                    <SectionBody
                      section={section}
                      festival={festival}
                      category={category}
                      schedulePlaceholder={schedulePlaceholder}
                    />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          );
        }

        if (group.type === "card") {
          return (
            <div
              key={group.section.id ?? `card-${groupIndex}`}
              className="rounded-lg border bg-muted/40 p-6"
            >
              {group.section.title ? (
                <h2 className="mb-2 text-lg font-semibold">
                  {group.section.title}
                </h2>
              ) : null}
              <SectionBody
                section={group.section}
                festival={festival}
                category={category}
                schedulePlaceholder={schedulePlaceholder}
              />
            </div>
          );
        }

        return (
          <div
            key={group.section.id ?? `plain-${groupIndex}`}
            className="flex flex-col gap-1 md:gap-2"
          >
            {group.section.title ? (
              <h2 className="text-lg font-semibold tracking-wide font-space-grotesk md:text-xl">
                {group.section.title}
              </h2>
            ) : null}
            <SectionBody
              section={group.section}
              festival={festival}
              category={category}
              schedulePlaceholder={schedulePlaceholder}
            />
            {groupIndex < groups.length - 1 ? <Separator /> : null}
          </div>
        );
      })}
    </div>
  );
}
