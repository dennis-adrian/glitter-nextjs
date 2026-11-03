import { BellRingIcon, Maximize2Icon, ZapIcon } from "lucide-react";

import Title from "@/app/components/atoms/heading";

/**
 * The top of `/instalar`: what installing gets you. Notifications are only
 * promised once they are open to this viewer.
 */
export default function InstallGuideIntro({
  pushAvailable,
}: {
  pushAvailable: boolean;
}) {
  const benefits = [
    ...(pushAvailable
      ? [
          {
            icon: BellRingIcon,
            title: "Enterate al instante",
            text: "Te avisamos de tus reservas, pagos, créditos y novedades aunque no tengas Glitter abierto.",
          },
        ]
      : []),
    {
      icon: ZapIcon,
      title: "A un toque",
      text: "Glitter queda en tu pantalla de inicio, como cualquier otra app.",
    },
    {
      icon: Maximize2Icon,
      title: "Pantalla completa",
      text: "Sin la barra del navegador, con más lugar para lo tuyo.",
    },
  ];

  return (
    <>
      <div className="mb-5 flex flex-col gap-1 md:gap-2">
        <Title data-installed-title="">Instalá Glitter</Title>
        <p className="text-sm leading-tight text-muted-foreground md:text-base">
          {pushAvailable
            ? "Agregá Glitter a la pantalla de inicio de tu teléfono y activá las notificaciones."
            : "Agregá Glitter a la pantalla de inicio de tu teléfono y abrilo como cualquier otra app."}{" "}
          Es gratis y no hace falta descargar nada de la App Store ni de Google
          Play.
        </p>
      </div>

      <ul
        className={
          pushAvailable
            ? "mb-6 grid gap-2 sm:grid-cols-3 sm:gap-3"
            : "mb-6 grid gap-2 sm:grid-cols-2 sm:gap-3"
        }
      >
        {benefits.map(({ icon: Icon, title, text }) => (
          // One row each on a phone, so step 1 stays near the top.
          <li
            key={title}
            className="flex items-start gap-3 rounded-lg bg-muted/50 p-3 sm:flex-col sm:gap-2"
          >
            <Icon
              className="mt-0.5 size-5 shrink-0 text-primary sm:mt-0"
              aria-hidden
            />
            <div>
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-sm text-muted-foreground">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
