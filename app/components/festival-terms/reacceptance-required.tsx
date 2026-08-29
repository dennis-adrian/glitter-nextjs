import { RedirectButton } from "@/app/components/redirect-button";

export default function TermsReacceptanceRequired({
  festivalId,
}: {
  festivalId: number;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 pt-8 text-center text-muted-foreground">
      <p>
        Hay una nueva versión de los términos y condiciones. Tenés que
        aceptarla para continuar con tu reserva.
      </p>
      <RedirectButton href={`/festivals/${festivalId}/terms`}>
        Leer y aceptar términos
      </RedirectButton>
    </div>
  );
}
