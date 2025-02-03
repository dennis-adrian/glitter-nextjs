"use client";

import ProfileAvatar from "@/app/components/common/profile-avatar";
import { RedirectButton } from "@/app/components/redirect-button";
import { ArrowRightIcon, LogInIcon, UserPlusIcon } from "lucide-react";
import NavigationSidebar from "@/app/components/ui/navigation-sidebar";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { MenuIcon } from "lucide-react";
import { ProfileType } from "@/app/api/users/definitions";
import { useState } from "react";
import {
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { usePathname, useRouter } from "next/navigation";
import { isNoNavigationPage } from "@/app/lib/utils";

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
            <DialogTitle className="text-center sr-only">
              ¿Estás seguro de que quieres crear una cuenta?
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 my-2">
            <h1 className="text-lg font-semibold text-center">
              ¿Te gustaría crear una cuenta?
            </h1>
            <p>
              La creación de cuentas está limitada a personas que quieran
              participar de nuestros festivales como expositores.
            </p>
            <p>
              Si simplemente te gustaría visitar nuestros festivales, no es
              necesario que te crees una cuenta.
            </p>
            <p>¿Quieres continuar y crear una cuenta?</p>
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
              <ArrowRightIcon className="ml-1 h-5 w-5" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
