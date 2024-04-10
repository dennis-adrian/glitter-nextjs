import ResourceNotFound from "@/app/components/resource-not-found";

export default async function Page() {
  return (
    <div className="container py-40">
      <ResourceNotFound />
    </div>
  );
}
