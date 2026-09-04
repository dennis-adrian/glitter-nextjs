import { CoinsIcon, ShieldCheckIcon, WalletIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";

/**
 * What credits are, before anyone has to decide whether to buy them.
 *
 * The wallet answers "how much do I have"; this answers "what is this". The two
 * questions arrive at different moments, which is why they are different pages
 * and why this one links from every surface that can spend credits.
 */
export default function CreditsExplainer() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CoinsIcon className="h-5 w-5 text-amber-500" />
            ¿Qué son los créditos?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Los créditos son una nueva opción de pago y actualmente la forma de
            activar funcionalidades extra que antes no era posible hacer. Te
            pueden ayudar a mejorar la experencia de tu reserva, o a corregir
            detalles que te faltaron al crear tu reserva.
          </p>
          <p>
            Son acumulativos y podés comprarlos cuando los necesités. Si no
            llegás a usar tus créditos en su momento, luego los podrás usar para
            descontar el valor de tu reserva.
          </p>
          <p>
            Todo lo que podías hacer en nuestro sitio web seguirá siendo
            posible, nada se quitará. Pero en el futuro los créditos traerán
            beneficios adicionales.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WalletIcon className="h-5 w-5 text-violet-500" />
            ¿Para qué sirven los créditos?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="font-medium text-foreground">
                Pagar tu reserva.
              </span>{" "}
              Podés cubrir la parte del costo de tu espacio con créditos, y el
              resto con un comprobante como siempre.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Reservar una mesa completa.
              </span>{" "}
              En los sectores de ilustración y emprendimientos creativos un
              espacio es media mesa, de 120 × 60 cm. La mesa completa son dos
              espacios contiguos, 240 × 60 cm. Activar la función
              de reservar una mesa completa te permitirá intentarlo pero no te
              garantiza ninguna mesa ni ubicación.
              <span className="block mt-1">
                Toma en cuenta que con los créditos solo estarías activando la opción de reservar{" "}
                una mesa completa. Esto es una funcionalidad adicional que no se puede hacaer regularmente.{" "}
                El precio de una mesa completa puede variar según el sector, pero en general es el equivalente al pago de{" "}
                dos espacios.
              </span>
            </li>
            <li>
              <span className="font-medium text-foreground">
                Editar tu reserva y agregar a un compañero de stand (solo
                ilustración).
              </span>{" "}
              Todos los ilustradores tienen la opción de agregar a un compañero
              de stand, pero esto se debe hacer al momento de crear tu reserva
              ya que una reserva creada ya no se puede modificar. Pero por
              tiempo limitado podrás usar créditos para adicionar un compañero
              de stand y corregir tu reserva.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Liberar tu reserva.
              </span>{" "}
              Tal vez cometiste un error y te gustaría agarrar un espacio en
              otra ubicación. O tal vez querés ser el compañero de stand de otro
              ilustrador. Para eso podés activar la opción de liberar tu
              reserva y modificar la manera en la que participas en festival.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="h-5 w-5 text-emerald-500" />
            ¿Los créditos son instantáneos?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Apenas subís tu comprobante de pago los créditos entran a tu
            billetera y, aunque estén{" "}
            <span className="font-medium text-foreground">en revisión</span>,
            los podés usar inmediatamente para todo: activar funciones
            opcionales como la mesa completa y también pagar la factura de tu
            reserva. No hay nada que esperar.
          </p>
          <p>
            La confirmación de tus créditos cargados se hará luego por un
            administrador, quien se encargará de confirmar tu comprobante de
            pago y en caso de que haya algún error, nos contactaremos para
            solucionarlo.
          </p>
          <p>
            Si el comprobante no corresponde, esos créditos saldrán de tu
            billetera y quedarás con un saldo negativo que te impedirá
            participar en futuros festivales o en cualquier actividad organizada
            por la Productora Glitter. Lo que ya pagaste con esos créditos sigue
            en pie: nada se cancela por este saldo.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Para tenerlo más claro que el agua</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-disc space-y-2 pl-5">
            <li>Los créditos no vencen: quedan en tu billetera.</li>
            <li>No se transfieren a otra persona.</li>
            <li>No se cambian por efectivo.</li>
            <li>
              Si no usás una función opcional, los créditos siguen siendo tuyos
              y podés usarlos de otra manera como en descuentos en tu reserva.
            </li>
          </ul>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/my_credits">Ver mi billetera</Link>
        </Button>
      </div>
    </div>
  );
}
