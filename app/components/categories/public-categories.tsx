import Heading from "@/app/components/atoms/heading";
import EntityThumbnail from "@/app/components/molecules/entity-thumbnail";
import RichTextHtml from "@/app/components/molecules/rich-text-html";
import { PUBLIC_CLOSED_CAPTION } from "@/app/lib/categories/copy";
import type { PublicCategory } from "@/app/lib/categories/definitions";
import { groupByManagementArea } from "@/app/lib/categories/group";

type PublicCategoriesProps = {
  categories: PublicCategory[];
};

export default function PublicCategories({ categories }: PublicCategoriesProps) {
  const grouped = groupByManagementArea(categories).filter(
    (group) => group.items.length > 0,
  );

  if (grouped.length === 0) {
    return (
      <p className="text-muted-foreground">
        Todavía no hay categorías publicadas.
      </p>
    );
  }

  return (
    <div className="space-y-10">
      {grouped.map((group) => (
        <section key={group.area} className="space-y-4">
          <Heading level={2} className="text-2xl md:text-3xl">
            {group.label}
          </Heading>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {group.items.map((category) => (
              <article
                key={category.id}
                className="overflow-hidden rounded-xl border bg-card"
              >
                <EntityThumbnail
                  src={category.imageUrl}
                  alt={category.label}
                  size="md"
                  className="rounded-none"
                />
                <div className="space-y-2 p-4">
                  <h3 className="text-lg font-semibold">{category.label}</h3>
                  {category.visibility === "listed" ? (
                    <p className="text-xs text-muted-foreground">
                      {PUBLIC_CLOSED_CAPTION}
                    </p>
                  ) : null}
                  <RichTextHtml html={category.descriptionHtml} />
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
