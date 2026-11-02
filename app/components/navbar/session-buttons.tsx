"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { useUser } from "@clerk/nextjs";
import { InfoIcon, LogInIcon, UserPlusIcon } from "lucide-react";

import { NavbarProfile } from "@/app/api/users/definitions";
import { RedirectButton } from "@/app/components/redirect-button";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import NotificationBell, {
  NotificationBellPlaceholder,
} from "@/app/components/notifications/notification-bell";
import { useReleaseForeignPushDevice } from "@/app/components/notifications/use-push-device";
import UserDropdown from "@/app/components/ui/user-dropdown";
import { cn, isNoNavigationPage, isStoreFlowPage } from "@/app/lib/utils";
import { UserDropdownSkeleton } from "@/app/components/user_dropdown/skeleton";

export default function SessionButtons({
  profile,
  creditsEnabled,
  notificationsEnabled = false,
  pushPublicKey = null,
  isProfileLoading,
  accountMenuClassName,
}: {
  profile?: NavbarProfile | null;
  creditsEnabled: boolean;
  /** The bell, for whoever the `notifications` flag lets in. */
  notificationsEnabled?: boolean;
  /** Offers avisos in the bell's popover; null when they are not open. */
  pushPublicKey?: string | null;
  /** Forwarded to the dropdown so a `null` profile is not read as loading. */
  isProfileLoading: boolean;
  /**
   * Classes for the account menu's wrapper. The desktop sidebar carries the
   * account card, so the header hides its own menu where the sidebar shows.
   */
  accountMenuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded, isSignedIn } = useUser();
  useReleaseForeignPushDevice(isSignedIn && profile ? profile.id : null);

  if (isNoNavigationPage(pathname)) {
    return null;
  }

  if (!isLoaded) {
    return (
      <div className="flex min-h-9 items-center justify-end">
        <UserDropdownSkeleton />
      </div>
    );
  }

  const storeFlow = isStoreFlowPage(pathname);

  if (!storeFlow && !isSignedIn) {
    return (
      <>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="px-1 md:px-2"
            onClick={() => setOpen(true)}
          >
            <UserPlusIcon className="mr-2 h-5 w-5 hidden xl:block" />
            Crear cuenta
          </Button>
          <RedirectButton href="/sign_in" size="sm" variant="outline">
            <LogInIcon className="mr-1 h-5 w-5 hidden xl:block" />
            Iniciar sesión
          </RedirectButton>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="p-4 md:p-6">
            <DialogHeader>
              <DialogTitle className="text-center">
                ¿Querés crear una cuenta?
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2 my-2 text-center">
              <InfoIcon className="w-12 h-12 mx-auto text-amber-500" />
              <p className="leading-5">
                Al crear una cuenta y completar tu perfil serás considerado para
                participar como expositor en nuestros eventos
              </p>
            </div>
            <DialogFooter className="flex flex-col-reverse md:flex-row w-full gap-2">
              <Button
                className="w-full"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                className="w-full"
                onClick={() => {
                  setOpen(false);
                  router.push("/sign_up");
                }}
              >
                Continuar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  const userDropdown = (
    <UserDropdown
      profile={profile}
      creditsEnabled={creditsEnabled}
      isProfileLoading={isProfileLoading}
    />
  );
  const dropdown = accountMenuClassName ? (
    <div className={cn("flex items-center", accountMenuClassName)}>
      {userDropdown}
    </div>
  ) : (
    userDropdown
  );

  // A Clerk session without a profile row (sign-up still finishing) has no
  // inbox: its unread count and page would only answer "not found". The bell
  // waits for the profile, holding its place meanwhile.
  if (!notificationsEnabled || !isSignedIn || (!isProfileLoading && !profile)) {
    return dropdown;
  }

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {profile ? (
        <NotificationBell pushPublicKey={pushPublicKey} />
      ) : (
        <NotificationBellPlaceholder />
      )}
      {dropdown}
    </div>
  );
}
