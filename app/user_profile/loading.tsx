import { UserProfileSkeleton } from "@/app/components/user_profile/skeleton";

export default function Loading() {
  return (
    <div className="h-full">
      <UserProfileSkeleton />
    </div>
  );
}
