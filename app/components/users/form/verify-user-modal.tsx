import { ProfileType } from "@/app/api/users/definitions";
import { Modal } from "@/app/components/atoms/modal";
import { VerifyProfileForm } from "@/app/components/users/form/verify-user-form";
import { AlertCircleIcon } from "lucide-react";

export function VerifyProfileModal({
	open,
	profile,
	setOpen,
}: {
	open: boolean;
	profile: ProfileType;
	setOpen: (open: boolean) => void;
}) {
	const userLabel =
		profile.displayName ||
		`${profile.firstName || ""} ${profile.lastName || ""}`;

	return (
		<Modal isOpen={open} onClose={() => setOpen(false)}>
			<div className="flex flex-col items-center gap-3 text-center my-4">
				<AlertCircleIcon size={48} className="text-amber-500" />
				<div className="flex flex-col gap-2">
					<p>
						¿Estás seguro que deseas verificar a <strong>{userLabel}</strong>?
					</p>
					<p>
						El usuario recibira un correo electrónico confirmando la
						verificación.
					</p>
				</div>
				<VerifyProfileForm profile={profile} onSuccess={() => setOpen(false)} />
			</div>
		</Modal>
	);
}
