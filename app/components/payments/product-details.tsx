import Image from "next/image";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { InvoiceBase } from "@/app/data/invoices/defiinitions";

type ProductDetailsProps = {
  festival: FestivalBase;
  invoice: InvoiceBase;
};

export function ProductDetails({ festival, invoice }: ProductDetailsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Detalles del Producto</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4">
          <div className="w-24 h-24 rounded-md overflow-hidden flex-shrink-0">
            <Image
              src="/img/stand-table-half-60x120.svg"
              alt="Mesa de stand"
              width={96}
              height={96}
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h3 className="font-semibold text-lg">1 espacio (stand)</h3>
            <p className="text-muted-foreground text-sm mb-2">
              {festival.name}
            </p>
            <div className="flex items-center gap-2">
              <span className="font-medium">Bs{invoice.amount}</span>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <h4 className="font-medium mb-2">Lo que incluye:</h4>
          <ul className="text-sm space-y-1">
            <li>• Participación en el festival {festival.name}</li>
            <li>
              • 1 espacio de 60cm x 120cm que corresponde a la mitad de una mesa
              de 60cm x 240cm (mesa incluida)
            </li>
            <li>• 2 sillas</li>
            <li>• 2 credenciales</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
