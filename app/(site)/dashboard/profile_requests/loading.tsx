import TableSkeleton from "@/app/components/users/skeletons/table";

export default function Loading() {
  return (
    <div className="container mx-auto min-h-full p-3 md:p-6">
      <div className="h-8 w-56 rounded bg-muted mb-4" />
      <TableSkeleton />
    </div>
  );
}
