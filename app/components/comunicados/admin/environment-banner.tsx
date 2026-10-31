import { FlaskConicalIcon } from "lucide-react";

import { Banner } from "@/app/components/ui/banner";

type VercelEnvironment = "development" | "preview" | "production";

const ENVIRONMENT_COPY = {
  preview:
    "Estás en un entorno de prueba: los comunicados a listas les llegan solo a los administradores. Las personas que elijas por nombre sí los reciben, con un correo real (marcado como prueba).",
  development:
    "Estás en desarrollo: los comunicados a listas les llegan solo a los administradores, y las personas que elijas por nombre los reciben en la app. En desarrollo no se envían correos.",
} as const satisfies Record<Exclude<VercelEnvironment, "production">, string>;

/**
 * Who a comunicado reaches outside production (G3, B6). The environment is
 * the server's own `VERCEL_ENV`, passed down: never read on the client.
 */
export default function ComunicadosEnvironmentBanner({
  environment,
}: {
  environment: VercelEnvironment;
}) {
  if (environment === "production") return null;
  return (
    <Banner variant="warning" icon={FlaskConicalIcon}>
      {ENVIRONMENT_COPY[environment]}
    </Banner>
  );
}
