import NewTag from "@/app/components/tags/new-tag";
import TagBadge from "@/app/components/tags/tag-badge";
import { fetchTags } from "@/app/lib/tags/actions";

export default async function Page() {
  const tags = await fetchTags();

  return (
    <div className="container p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="mb-2 text-2xl font-bold md:text-4xl">Tags</h1>
        <NewTag />
      </div>
      <section className="grid gap-2 my-4">
        {tags.map((tag) => (
          <TagBadge key={tag.id} tag={tag} />
        ))}
      </section>
    </div>
  );
}
