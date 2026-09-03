import {
  ClockIcon,
  CoinsIcon,
  ShieldCheckIcon,
  WalletIcon,
} from "lucide-react";
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
            <CoinsIcon className="h-5 w-5 text-amber-500" />1 crédito = Bs 1
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Los créditos son la forma de pagar dentro del festival. Un crédito
            vale exactamente un boliviano: no hay conversión ni comisión, y el
            monto que ves es el monto que pagás.
          </p>
          <p>
            No los comprás por tu cuenta ni elegís cuántos: cada compra la
            iniciás desde aquello que querés pagar, y es por la diferencia
            exacta que te falta. Así nunca te quedan créditos sueltos que no
            pediste.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WalletIcon className="h-5 w-5 text-violet-500" />
            Para qué sirven hoy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="font-medium text-foreground">
                Pagar tu reserva.
              </span>{" "}
              Podés cubrir la factura de tu espacio entera o en parte con
              créditos, y el resto con un comprobante como siempre.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Activar la mesa completa.
              </span>{" "}
              Un espacio es media mesa, de 120 × 60 cm. La mesa completa son dos
              espacios contiguos, 240 × 60 cm, para vos solo. Activarla te
              habilita a intentar tomar una mientras haya disponibles; no
              reserva ni garantiza ninguna mesa ni ubicación.
            </li>
          </ul>
          <p>
            Mientras la mesa completa está activada, esos créditos quedan
            apartados y no se pueden usar en otra cosa. Si al final tomás un
            solo espacio o desactivás la función, vuelven a estar disponibles y
            podés usarlos para pagar tu reserva.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClockIcon className="h-5 w-5 text-sky-500" />
            Cómo se compran: tenés diez minutos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Cuando iniciás una compra te damos diez minutos para subir el
            comprobante de la transferencia. Es un plazo corto a propósito:
            mientras tanto no se te reserva ni se te aparta nada, así que nadie
            queda esperando por una compra que no se concreta.
          </p>
          <p>
            Si se te pasa el plazo no se acredita nada y no queda ningún
            registro pendiente a tu nombre. Simplemente empezás una compra
            nueva.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="h-5 w-5 text-emerald-500" />
            En revisión y confirmados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Apenas subís el comprobante los créditos entran a tu billetera{" "}
            <span className="font-medium text-foreground">en revisión</span>.
            Con esos ya podés activar funciones opcionales como la mesa
            completa, sin esperar a que revisemos nada.
          </p>
          <p>
            Para pagar la factura de tu reserva necesitás créditos{" "}
            <span className="font-medium text-foreground">confirmados</span>, es
            decir después de que aprobemos el comprobante. Es la única
            diferencia entre unos y otros.
          </p>
          <p>
            Si el comprobante no corresponde, esos créditos salen de tu
            billetera. Cuando ya los habías usado en una función, tu saldo queda
            en negativo hasta que lo regularices, y no vas a poder usar créditos
            mientras tanto. Lo que hayas hecho con ellos sigue en pie: nada se
            cancela por ese saldo, y lo resolvés desde tu billetera.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lo que conviene tener claro</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-disc space-y-2 pl-5">
            <li>Los créditos no vencen: quedan en tu billetera.</li>
            <li>No se transfieren a otra persona.</li>
            <li>No se cambian por efectivo.</li>
            <li>
              Si no usás una función opcional, los créditos siguen siendo tuyos
              y podés usarlos para pagar tu reserva.
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
