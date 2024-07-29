import NewTag from "@/app/components/tags/new-tag";
import TagsCard from "@/app/components/tags/organisms/tags-card";
import { fetchTags } from "@/app/lib/tags/actions";

export default async function TagsPage() {
  const tags = await fetchTags();
  const illustrationTags = tags.filter(
    (tag) => tag.category === "illustration" || tag.category === "new_artist",
  );
  const entrepreneurshipTags = tags.filter(
    (tag) => tag.category === "entrepreneurship",
  );
  const gastronomyTags = tags.filter((tag) => tag.category === "gastronomy");

  return (
    <div className="container p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="mb-2 text-2xl font-bold md:text-4xl">Etiquetas</h1>
        <NewTag />
      </div>
      <div className="grid gap-2 my-4">
        {illustrationTags.length > 0 && (
          <TagsCard
            title="Etiquetas para ilustradores"
            tags={illustrationTags}
          />
        )}
        {entrepreneurshipTags.length > 0 && (
          <TagsCard
            title="Etiquetas para emprendimientos artísticos"
            tags={entrepreneurshipTags}
          />
        )}
        {gastronomyTags.length > 0 && (
          <TagsCard title="Etiquetas para gastronomía" tags={gastronomyTags} />
        )}
      </div>
    </div>
  );
}
