import { UserCategory } from "@/app/api/users/definitions";
import { Badge } from "@/app/components/ui/badge";
import { Card, CardContent } from "@/app/components/ui/card";

export default function StandSpecificationsCards({
  category,
}: {
  category: UserCategory;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {category === "illustration" && (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-[#FFA600] p-3">
              <h3 className="font-semibold text-primary-foreground">Galería</h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <span className="font-medium">Especificaciones:</span>
                  <p className="text-muted-foreground">
                    60cm x 120cm (media mesa). Proximidad a entrada principal.
                    Puede compartir espacio con otro ilustrador
                  </p>
                </div>
                <Badge variant="outline" className="text-lg">
                  Bs300
                </Badge>
              </div>

              <div>
                <span className="font-medium">Servicios Incluidos:</span>
                <ul className="text-muted-foreground list-disc pl-5 mt-1">
                  <li>Puntos de conexión a electricidad</li>
                  <li>Ambiente cerrado con aire acondicionado</li>
                  <li>2 credenciales</li>
                  <li>2 sillas</li>
                  <li>Mesa incluida</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {category === "entrepreneurship" && (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-[#2764FF] p-3">
              <h3 className="font-semibold text-primary-foreground">
                Pasillo (Emprendimientos Creativos)
              </h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <span className="font-medium">Especificaciones:</span>
                  <p className="text-muted-foreground">
                    60cm x 120cm (media mesa). Área de alto tráfico. No puede
                    compartir espacio con otro expositor.
                  </p>
                </div>
                <Badge variant="outline" className="text-lg">
                  Bs300
                </Badge>
              </div>

              <div>
                <span className="font-medium">Servicios Incluidos:</span>
                <ul className="text-muted-foreground list-disc pl-5 mt-1">
                  <li>Ambiente abierto, techado</li>
                  <li>2 credenciales</li>
                  <li>2 sillas</li>
                  <li>Mesa incluida</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {category === "illustration" && (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-[#C199FF] p-3">
              <h3 className="font-semibold text-primary-foreground">
                Big Apple
              </h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <span className="font-medium">Especificaciones:</span>
                  <p className="text-muted-foreground">
                    60cm x 120cm (media mesa). Área de alto tráfico. Puede
                    compartir espacio con otro ilustrador
                  </p>
                </div>
                <Badge variant="outline" className="text-lg">
                  Bs280
                </Badge>
              </div>

              <div>
                <span className="font-medium">Servicios Incluidos:</span>
                <ul className="text-muted-foreground list-disc pl-5 mt-1">
                  <li>Ambiente abierto, techado</li>
                  <li>2 credenciales</li>
                  <li>2 sillas</li>
                  <li>Mesa incluida</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* {category === "illustration" && (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-[#FF46A6] p-3">
              <h3 className="font-semibold text-primary-foreground">
                Ballivián (Ilustradores)
              </h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <span className="font-medium">Especificaciones:</span>
                  <p className="text-muted-foreground">
                    60cm x 120cm (media mesa). Área final. Puede compartir
                    espacio con otro ilustrador
                  </p>
                </div>
                <Badge variant="outline" className="text-lg">
                  Bs210
                </Badge>
              </div>

              <div>
                <span className="font-medium">Servicios Incluidos:</span>
                <ul className="text-muted-foreground list-disc pl-5 mt-1">
                  <li>Ambiente semi-abierto, techado</li>
                  <li>2 credenciales</li>
                  <li>2 sillas</li>
                  <li>Mesa incluida</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )} */}

      {category === "entrepreneurship" && (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-[#FF46A6] p-3">
              <h3 className="font-semibold text-primary-foreground">
                Ballivián (Emprendimientos Creativos)
              </h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <span className="font-medium">Especificaciones:</span>
                  <p className="text-muted-foreground">
                    60cm x 120cm (media mesa). Área final. No puede compartir
                    espacio con otro expositor.
                  </p>
                </div>
                <Badge variant="outline" className="text-lg">
                  Bs260
                </Badge>
              </div>

              <div>
                <span className="font-medium">Servicios Incluidos:</span>
                <ul className="text-muted-foreground list-disc pl-5 mt-1">
                  <li>Ambiente semi-abierto, techado</li>
                  <li>2 credenciales</li>
                  <li>2 sillas</li>
                  <li>Mesa incluida</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {category === "gastronomy" && (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-[#FF46A6] p-3">
              <h3 className="font-semibold text-primary-foreground">
                Ballivián (Gastronomía)
              </h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <span className="font-medium">Especificaciones:</span>
                  <p className="text-muted-foreground">
                    80cm x 100cm (mesa completa). Área final. No puede compartir
                    espacio.
                  </p>
                </div>
                <Badge variant="outline" className="text-lg">
                  Bs350
                </Badge>
              </div>

              <div>
                <span className="font-medium">Servicios Incluidos:</span>
                <ul className="text-muted-foreground list-disc pl-5 mt-1">
                  <li>Puntos de conexión a electricidad</li>
                  <li>Ambiente semi-abierto, techado</li>
                  <li>2 credenciales</li>
                  <li>2 sillas</li>
                  <li>Mesa incluida</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
