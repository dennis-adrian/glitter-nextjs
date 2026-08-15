import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";

export default function FastPassDiscoveryHero() {
  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-primary">
          Pase Rápido
        </p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Menos fila. Más festival.
        </h1>
        <p className="max-w-2xl text-muted-foreground md:text-lg">
          Ingresá por el acceso prioritario Pase Rápido durante todo el día.
          Escaneá tu QR una sola vez y reingresá mostrando tu pulsera.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Importante</CardTitle>
          <CardDescription>
            El ingreso está sujeto al aforo del recinto, los controles de
            seguridad, el horario del festival y la posible espera de otros
            visitantes con Pase Rápido.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-disc space-y-1 pl-5">
            <li>Evitá la fila de admisión general.</li>
            <li>Acceso prioritario en cada ingreso.</li>
            <li>Validación QR solo una vez; después usás tu pulsera.</li>
            <li>Válido para el día de festival que elijas.</li>
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
