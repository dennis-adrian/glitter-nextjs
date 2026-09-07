import { StoreIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";

type Props = {
  title: string | null;
  message: string | null;
};

const DEFAULT_TITLE = "La tiendita está cerrada";
const DEFAULT_MESSAGE =
  "Estamos haciendo una pausa por el momento. ¡Vuelve pronto para seguir comprando en línea!";

export default function StoreClosedNotice({ title, message }: Props) {
  return (
    <div className="container px-3 py-10">
      <Alert>
        <StoreIcon className="h-4 w-4" />
        <AlertTitle>{title?.trim() || DEFAULT_TITLE}</AlertTitle>
        <AlertDescription>
          <p className="whitespace-pre-line">
            {message?.trim() || DEFAULT_MESSAGE}
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}
