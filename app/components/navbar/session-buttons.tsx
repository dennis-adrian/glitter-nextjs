"use client";

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
import UserDropdown from "@/app/components/ui/user-dropdown";
import { isNoNavigationPage } from "@/app/lib/utils";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { InfoIcon, LogInIcon, UserPlusIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export default function SessionButtons({
	profile,
}: {
	profile?: NavbarProfile | null;
}) {
	const [open, setOpen] = useState(false);
	const router = useRouter();
	const pathname = usePathname();

	if (isNoNavigationPage(pathname)) {
		return null;
	}

	return (
		<div>
			<SignedIn>
				<UserDropdown profile={profile} />
			</SignedIn>
			<SignedOut>
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
