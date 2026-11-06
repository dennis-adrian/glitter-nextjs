import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import type { DistributionListMember } from "@/app/lib/distribution_lists/definitions";

/** A person on a list, and why they would not receive it today, if so. */
export default function ListMemberCell({
  member,
}: {
  member: DistributionListMember;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="h-8 w-8 border">
        <AvatarImage src={member.imageUrl} alt="" sizes="32px" />
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium">{member.name}</p>
        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
        {member.skipReason && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            No lo recibe ahora: {member.skipReason}
          </p>
        )}
      </div>
    </div>
  );
}
