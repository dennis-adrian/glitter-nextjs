import CreateProfileForm from "@/app/(routes)/profile_verification/create-profile-form";
import DeleteUserForm from "@/app/(routes)/profile_verification/delete-user-form";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { InfoIcon } from "lucide-react";

export default function CreateProfileModal() {
  return (
    <Dialog open={true}>
      <DialogContent hideCloseButton>
        <DialogTitle className="text-center">Completa tu perfil</DialogTitle>
        <div className="text-center py-2">
          <InfoIcon className="w-12 h-12 mx-auto text-amber-500" />
          <div className="mt-2 leading-5">
            Enseguida te pediremos los datos que necesitamos para completar la
            creación tu perfil
          </div>
        </div>
        <DialogFooter className="flex flex-col-reverse md:flex-row gap-2">
          <DeleteUserForm />
          <CreateProfileForm />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
