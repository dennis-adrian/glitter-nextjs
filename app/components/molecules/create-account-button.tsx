import { RedirectButton } from "@/app/components/redirect-button";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { ArrowRightIcon, UserPlusIcon } from "lucide-react";

export default function CreateAccountButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost">
          <UserPlusIcon className="mr-2 h-5 w-5 hidden xl:block" />
          Crear cuenta
        </Button>
      </DialogTrigger>
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
          <DialogClose asChild>
            <Button className="w-full" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <RedirectButton className="w-full" href="/sign_up">
              Continuar
              <ArrowRightIcon className="ml-1 h-5 w-5" />
            </RedirectButton>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
