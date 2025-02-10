"use client";

import { ProfileType } from "@/app/api/users/definitions";
import ProfileAvatar from "@/app/components/common/profile-avatar";
import { RedirectButton } from "@/app/components/redirect-button";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import NavigationSidebar from "@/app/components/ui/navigation-sidebar";
import { isNoNavigationPage } from "@/app/lib/utils";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { InfoIcon, LogInIcon, MenuIcon, UserPlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export default function SessionButtons({
  profile,
}: {
  profile?: ProfileType | null;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  if (isNoNavigationPage(pathname)) {
    return null;
  }

  return (
    <div>
      {/* if the user is signed in, show the profile avatar. No matter the screen size */}
      <SignedIn>
        <NavigationSidebar
          profile={profile}
          onCreateAccountClick={() => setOpen(true)}
        >
          <ProfileAvatar
            profile={profile!}
            className="h-10 w-10"
            showBadge={false}
          />
        </NavigationSidebar>
      </SignedIn>
      <SignedOut>
        <div className="block lg:hidden">
          <NavigationSidebar
            profile={profile}
            onCreateAccountClick={() => setOpen(true)}
          >
            <MenuIcon className="h-5 w-5" />
          </NavigationSidebar>
        </div>
        <div className="gap-1 hidden lg:flex">
          <Button variant="ghost" onClick={() => setOpen(true)}>
            <UserPlusIcon className="mr-2 h-5 w-5 hidden xl:block" />
            Crear cuenta
          </Button>
          <RedirectButton href="/sign_in" variant="outline">
            <LogInIcon className="mr-1 h-5 w-5 hidden xl:block" />
            Iniciar sesión
          </RedirectButton>
        </div>
      </SignedOut>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-4 md:p-6">
          <DialogHeader>
            <DialogTitle className="text-center">
              ¿Quieres crear una cuenta?
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 my-2 text-center">
            <InfoIcon className="w-12 h-12 mx-auto text-amber-500" />
            <p className="leading-5">
              Al crear una cuenta y completar tu perfil serás considerado para
              participar como expositor en nuestros eventos
            </p>
            <p>
              Si ya tienes una cuenta, haz clic{" "}
              <Link className="underline text-blue-500" href="/sign_in">
                aquí
              </Link>
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
    </div>
  );
}
