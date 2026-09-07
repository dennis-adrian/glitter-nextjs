import { MoreHorizontal } from "lucide-react";

import { ProfileType } from "@/app/api/users/definitions";
import ProfileQuickActions from "@/app/components/user_profile/public_profile/quick-actions";

export function ActionsCell({ user }: { user: ProfileType }) {
  return (
    <ProfileQuickActions
      profile={user}
      triggerVariant="ghost"
      triggerSize="icon"
      triggerClassName="h-8 w-8 p-0"
    >
      <>
        <span className="sr-only">Open menu</span>
        <MoreHorizontal className="h-4 w-4" />
      </>
    </ProfileQuickActions>
  );
}
