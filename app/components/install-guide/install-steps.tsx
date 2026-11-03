import {
  EllipsisIcon,
  EllipsisVerticalIcon,
  MenuIcon,
  ShareIcon,
  SquarePlusIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import type {
  InstallBrowser,
  InstallPlatform,
} from "@/app/lib/install-guide/platform";

/**
 * The install steps for each phone browser, as they read on screen. Kept
 * apart from the page so the guide for this phone and the ones under «¿Usás
 * otro teléfono?» are the same text. Computers get no steps: Glitter is
 * installed on phones.
 *
 * Labels follow each browser's Latin American Spanish menus; when a browser
 * has used more than one label, both are named.
 */

/** A button or menu entry as it reads on screen. */
export function UiLabel({
  icon,
  srLabel,
  children,
}: {
  icon?: ReactNode;
  /** What an icon-only button is, for screen readers. */
  srLabel?: string;
  children?: ReactNode;
}) {
  return (
    <span className="mx-0.5 inline-flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 align-middle text-xs font-medium text-foreground [&_svg]:size-3.5">
      {icon}
      {srLabel && <span className="sr-only">{srLabel}</span>}
      {children}
    </span>
  );
}

export type InstallGuideText = {
  steps: ReactNode[];
  /** A line under the steps: a fallback, or what this browser cannot do. */
  note?: ReactNode;
};

const OPEN_FROM_ICON =
  "Abrí Glitter desde el ícono nuevo en tu pantalla de inicio.";

function iosSteps(firstStep: ReactNode): ReactNode[] {
  return [
    firstStep,
    <>
      Deslizá hacia abajo y tocá{" "}
      <UiLabel icon={<SquarePlusIcon aria-hidden />}>Agregar a inicio</UiLabel>.
    </>,
    <>
      Si ves la opción «Abrir como app web», dejala activada. Después tocá{" "}
      <UiLabel>Agregar</UiLabel>.
    </>,
    OPEN_FROM_ICON,
  ];
}

export const IOS_SAFARI_GUIDE: InstallGuideText = {
  steps: iosSteps(
    <>
      Tocá <UiLabel icon={<ShareIcon aria-hidden />}>Compartir</UiLabel>, el
      cuadrado con una flecha hacia arriba, en la barra de Safari (abajo en
      iPhone, arriba en iPad). Si no lo ves, tocá{" "}
      <UiLabel icon={<EllipsisIcon aria-hidden />} srLabel="Más opciones" />{" "}
      primero.
    </>,
  ),
};

function iosBrowserGuide(browser: InstallBrowser): InstallGuideText {
  const where =
    browser === "chrome" ? (
      <>en la barra de direcciones</>
    ) : (
      <>
        en el menú del navegador (
        <UiLabel
          icon={
            browser === "firefox" ? (
              <MenuIcon aria-hidden />
            ) : (
              <EllipsisIcon aria-hidden />
            )
          }
          srLabel="Menú"
        />
        )
      </>
    );
  return {
    steps: iosSteps(
      <>
        Tocá <UiLabel icon={<ShareIcon aria-hidden />}>Compartir</UiLabel>,{" "}
        {where}.
      </>,
    ),
    note: "¿No aparece «Agregar a inicio»? Abrí esta página en Safari y seguí los pasos desde ahí.",
  };
}

/** Instagram's, Facebook's or TikTok's own browser, on either system. */
function inAppGuide(system: "ios" | "android"): InstallGuideText {
  return {
    steps: [
      system === "ios" ? (
        <>
          Tocá{" "}
          <UiLabel icon={<EllipsisIcon aria-hidden />} srLabel="Más opciones" />{" "}
          arriba a la derecha y elegí «Abrir en navegador externo» o «Abrir en
          Safari».
        </>
      ) : (
        <>
          Tocá{" "}
          <UiLabel icon={<EllipsisVerticalIcon aria-hidden />} srLabel="Menú" />{" "}
          arriba a la derecha y elegí «Abrir en Chrome» o «Abrir en el
          navegador».
        </>
      ),
      system === "ios"
        ? "Si no encontrás esa opción, copiá el enlace de abajo y pegalo en Safari."
        : "Si no encontrás esa opción, copiá el enlace de abajo y pegalo en Chrome.",
      "Con la página abierta ahí, seguí los pasos que te mostramos.",
    ],
    note:
      system === "ios"
        ? "Las apps como Instagram abren los enlaces en un navegador propio, que no puede instalar nada."
        : "Las apps como Instagram abren los enlaces en un navegador propio, que no puede instalar apps.",
  };
}

function androidGuide(browser: InstallBrowser): InstallGuideText {
  if (browser === "samsung") {
    return {
      steps: [
        <>
          Tocá <UiLabel icon={<MenuIcon aria-hidden />} srLabel="Menú" /> abajo
          a la derecha.
        </>,
        "Elegí «Agregar página a» y después «Pantalla de inicio».",
        OPEN_FROM_ICON,
      ],
    };
  }
  if (browser === "firefox") {
    return {
      steps: [
        <>
          Tocá{" "}
          <UiLabel icon={<EllipsisVerticalIcon aria-hidden />} srLabel="Menú" />{" "}
          en la barra del navegador.
        </>,
        "Elegí «Instalar» o «Agregar a la pantalla de inicio».",
        OPEN_FROM_ICON,
      ],
    };
  }
  const menu =
    browser === "edge" ? (
      <>
        Tocá <UiLabel icon={<MenuIcon aria-hidden />} srLabel="Menú" /> abajo,
        en la barra de Edge.
      </>
    ) : (
      <>
        Tocá{" "}
        <UiLabel icon={<EllipsisVerticalIcon aria-hidden />} srLabel="Menú" />{" "}
        arriba a la derecha.
      </>
    );
  return {
    steps: [
      menu,
      browser === "edge"
        ? "Elegí «Agregar al teléfono» o «Instalar app»."
        : "Elegí «Instalar app» o «Agregar a la pantalla principal».",
      <>
        Confirmá con <UiLabel>Instalar</UiLabel>.
      </>,
      OPEN_FROM_ICON,
    ],
  };
}

const OTHER_GUIDE: InstallGuideText = {
  steps: [
    "Abrí el menú del navegador.",
    "Buscá «Instalar», «Instalar app» o «Agregar a la pantalla de inicio».",
  ],
  note: "Si no aparece, probá con Chrome en Android o con Safari en iPhone.",
};

/**
 * The steps for this browser. Null when there is nothing to install here: the
 * installed app, or a computer, which is sent to its phone instead.
 */
export function installGuideFor(
  platform: InstallPlatform,
  browser: InstallBrowser,
): InstallGuideText | null {
  switch (platform) {
    case "unknown":
    case "installed":
    case "desktop":
      return null;
    case "ios-safari":
      return IOS_SAFARI_GUIDE;
    case "ios-browser":
      return iosBrowserGuide(browser);
    case "ios-in-app":
      return inAppGuide("ios");
    case "android-in-app":
      return inAppGuide("android");
    case "android-chromium":
    case "android-firefox":
      return androidGuide(browser);
    case "other":
      return OTHER_GUIDE;
  }
}

/** For «¿Usás otro teléfono?»: the most common browser on each. */
export const PHONE_GUIDES: {
  key: "ios" | "android";
  title: string;
  guide: InstallGuideText;
}[] = [
  { key: "ios", title: "iPhone y iPad", guide: IOS_SAFARI_GUIDE },
  { key: "android", title: "Android", guide: androidGuide("chrome") },
];

export function InstallStepList({ guide }: { guide: InstallGuideText }) {
  return (
    <div className="space-y-3">
      {guide.steps.length > 0 && (
        <ol className="space-y-3">
          {guide.steps.map((step, index) => (
            <li key={index} className="flex gap-3 text-sm leading-relaxed">
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
              >
                {index + 1}
              </span>
              <span className="min-w-0 pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      )}
      {guide.note && (
        <p className="text-sm text-muted-foreground">{guide.note}</p>
      )}
    </div>
  );
}
