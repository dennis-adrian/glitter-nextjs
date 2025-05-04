import { ProfileType } from "@/app/api/users/definitions";
import { Modal } from "@/app/components/atoms/modal";
import { Button } from "@/app/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/app/components/ui/dialog";
import RejectProfileForm from "@/app/components/users/form/reject-profile-form";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { AlertCircleIcon } from "lucide-react";

export function RejectProfileModal({
	open,
	profile,
	setOpen,
}: {
	open: boolean;
	profile: ProfileType;
	setOpen: (open: boolean) => void;
}) {
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const userLabel =
		profile.displayName ||
		`${profile.firstName || ""} ${profile.lastName || ""}`;

	return (
		// <Dialog open={open} onOpenChange={setOpen}>
		//   <DialogContent className="sm:max-w-[425px]">
		//     <DialogHeader>
		//       <DialogTitle>Rechazar Perfil</DialogTitle>
		//     </DialogHeader>

		//     <div className={`${isDesktop ? "" : "px-4"}`}>
		//       <div className="flex items-center flex-col gap-6 m-auto text-center py-4">
		//         <AlertCircleIcon size={48} className="text-amber-500" />
		//         <div className="flex flex-col gap-2">
		//           <p>
		//             ¿Estás seguro que deseas rechazar el perfil de{" "}
		//             <strong>{userLabel}</strong>?
		//           </p>
		//           <p>
		//             Necesitas agregar una razón para rechazar el perfil. Y el
		//             usuario la recibirá por correo electrónico.
		//           </p>
		//         </div>
		//       </div>
		//       <RejectProfileForm
		//         profile={profile}
		//         onSuccess={() => setOpen(false)}
		//       />
		//     </div>
		//     {isDesktop ? null : (
		//       <DialogFooter className="pt-2">
		//         <DialogClose asChild>
		//           <Button variant="outline">Cancelar</Button>
		//         </DialogClose>
		//       </DialogFooter>
		//     )}
		//   </DialogContent>
		// </Dialog>
		<Modal isOpen={open} onClose={() => setOpen(false)}>
			<div className="flex flex-col items-center gap-3 text-center my-4">
				<h1 className="text-xl font-bold">Rechazar Perfil</h1>
				<AlertCircleIcon size={48} className="text-amber-500" />
				<p>
					¿Estás seguro que deseas rechazar el perfil de{" "}
					<strong>{userLabel}</strong>?
				</p>
				<p>
					Necesitas agregar una razón para rechazar el perfil. Y el usuario la
					recibirá por correo electrónico.
				</p>
				<RejectProfileForm profile={profile} onSuccess={() => setOpen(false)} />
			</div>
		</Modal>
	);
}
