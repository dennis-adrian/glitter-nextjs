import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { fetchBundleManagement } from "@/app/lib/merch/bundles";
import { formatBundleMoney } from "@/app/lib/merch/bundle-pricing";
import { merchBundlePath } from "@/app/lib/merch/paths";

export default async function BundlesPage() {
  const bundles = await fetchBundleManagement();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Combos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ofertas de precio fijo con productos de merch existentes. El stock
            se descuenta de cada producto incluido.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/store/bundles/add">Crear combo</Link>
        </Button>
      </div>
      {bundles.length === 0 ? (
        <p className="rounded-xl border p-8 text-center text-muted-foreground">
          Crea tu primer combo eligiendo al menos dos productos y un precio
          menor al de comprarlos por separado.
        </p>
      ) : (
        <div className="divide-y rounded-xl border">
          {bundles.map((bundle) => {
            const { evaluation } = bundle;
            const sellable = bundle.isVisible && evaluation.issues.length === 0;
            const status = !bundle.isVisible
              ? "Borrador"
              : !sellable
                ? "Publicado · No disponible"
                : bundle.inStock
                  ? "Publicado"
                  : "Publicado · Agotado";
            const savings =
              evaluation.separateMinCents != null
                ? evaluation.separateMinCents - evaluation.priceCents
                : null;
            return (
              <div
                key={bundle.id}
                className="flex flex-wrap items-center justify-between gap-4 p-4"
              >
                <div className="min-w-0 space-y-1">
                  <h3 className="break-words font-medium">{bundle.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {status} · {formatBundleMoney(evaluation.priceCents)}
                    {evaluation.separateMinCents != null &&
                      ` · Por separado ${formatBundleMoney(evaluation.separateMinCents)}`}
                    {savings != null &&
                      savings > 0 &&
                      ` · Ahorro ${formatBundleMoney(savings)}`}
                    {` · ${bundle.components.length} productos · Orden ${bundle.sortOrder}`}
                  </p>
                  {evaluation.issues.length > 0 && (
                    <p
                      className={
                        bundle.isVisible
                          ? "text-sm text-destructive"
                          : "text-sm text-amber-700"
                      }
                    >
                      {bundle.isVisible ? "No se muestra: " : "Pendiente: "}
                      {evaluation.issues[0].message}
                    </p>
                  )}
                </div>
                <div className="flex gap-3">
                  {sellable && (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={merchBundlePath(bundle.slug)}>
                        Ver en tienda
                      </Link>
                    </Button>
                  )}
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={`/dashboard/store/bundles/${bundle.id}/edit`}
                      aria-label={`Editar ${bundle.name}`}
                    >
                      Editar
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
