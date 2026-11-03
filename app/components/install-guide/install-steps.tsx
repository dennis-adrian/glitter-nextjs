import {
  BellIcon,
  ChevronDownIcon,
  EllipsisIcon,
  EllipsisVerticalIcon,
  MenuIcon,
  ShareIcon,
  SquarePlusIcon,
} from "lucide-react";
import Image from "next/image";
import { isValidElement, type ReactNode } from "react";

import { ENABLE_PUSH_LABEL } from "@/app/components/notifications/push-control";

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

/**
 * A screenshot under a step, from `public/img/install-guide/`. Taken on an
 * iPhone (iOS 26, Safari) and on Android (Chrome), and cropped to the part
 * that matters, with the control to tap ringed; nothing personal is left in
 * them.
 */
type StepImage = { src: string; width: number; height: number; alt: string };

export type InstallStep = ReactNode | { text: ReactNode; images: StepImage[] };

export type InstallGuideText = {
  steps: InstallStep[];
  /** A line under the steps: a fallback, or what this browser cannot do. */
  note?: ReactNode;
};

const IMAGES = "/img/install-guide";

const IOS_IMAGES = {
  addressBar: {
    src: `${IMAGES}/ios-1-address-bar.webp`,
    width: 804,
    height: 136,
    alt: "La barra de Safari, con el ícono a la izquierda de la dirección marcado.",
  },
  shareMenu: {
    src: `${IMAGES}/ios-2-share-menu.webp`,
    width: 556,
    height: 410,
    alt: "El menú que se abre, con «Compartir» marcado.",
  },
  more: {
    src: `${IMAGES}/ios-3-more.webp`,
    width: 864,
    height: 290,
    alt: "Los botones de Compartir, con «Ver más» marcado.",
  },
  addToHome: {
    src: `${IMAGES}/ios-4-add-to-home.webp`,
    width: 864,
    height: 610,
    alt: "La lista de opciones, con «Agregar a Inicio» marcado.",
  },
  confirm: {
    src: `${IMAGES}/ios-5-confirm.webp`,
    width: 924,
    height: 740,
    alt: "La pantalla «Agregar a Inicio», con «Abrir como app web» activado y el botón «Agregar» marcado.",
  },
  homeIcon: {
    src: `${IMAGES}/ios-6-home-icon.webp`,
    width: 420,
    height: 270,
    alt: "El ícono de Glitter en la pantalla de inicio.",
  },
  bell: {
    src: `${IMAGES}/ios-7-bell.webp`,
    width: 798,
    height: 170,
    alt: "La barra de arriba de Glitter, con la campana marcada.",
  },
  enablePush: {
    src: `${IMAGES}/ios-8-enable-push.webp`,
    width: 884,
    height: 410,
    alt: `La tarjeta «Notificaciones en este dispositivo», con el botón «${ENABLE_PUSH_LABEL}» marcado.`,
  },
} satisfies Record<string, StepImage>;

/**
 * Chrome on Android (Dennis's screenshots, 2026-11-03), cropped the same way:
 * no status bar, the open-tab count painted over, and no home screen.
 */
const ANDROID_IMAGES = {
  menuButton: {
    src: `${IMAGES}/android-1-menu-button.webp`,
    width: 878,
    height: 124,
    alt: "La barra de Chrome, con el botón de menú (tres puntos) marcado.",
  },
  installMenu: {
    src: `${IMAGES}/android-2-install-menu.webp`,
    width: 774,
    height: 350,
    alt: "El menú de Chrome, con «Instalar y crear acceso directo» marcado.",
  },
  installSheet: {
    src: `${IMAGES}/android-3-install-sheet.webp`,
    width: 878,
    height: 490,
    alt: "La ventana «Instalar y crear acceso directo», con «Instalar» marcado y «Crear acceso directo» debajo.",
  },
  installDialog: {
    src: `${IMAGES}/android-4-install-dialog.webp`,
    width: 834,
    height: 502,
    alt: "La ventana «Instalar aplicación» de Glitter, con el botón «Instalar» marcado.",
  },
} satisfies Record<string, StepImage>;

const OPEN_FROM_ICON =
  "Abrí Glitter desde el ícono nuevo en tu pantalla de inicio. Si te lo pide, iniciá sesión.";

/** From the share sheet on, every iPhone browser shows the same screens. */
function iosSteps(firstStep: InstallStep): InstallStep[] {
  return [
    firstStep,
    {
      text: (
        <>
          Tocá <UiLabel icon={<ChevronDownIcon aria-hidden />}>Ver más</UiLabel>{" "}
          y después{" "}
          <UiLabel icon={<SquarePlusIcon aria-hidden />}>
            Agregar a Inicio
          </UiLabel>
          . Si no ves «Ver más», desplazate hacia abajo en la lista hasta
          «Agregar a Inicio».
        </>
      ),
      images: [IOS_IMAGES.more, IOS_IMAGES.addToHome],
    },
    {
      text: (
        <>
          Dejá activada la opción «Abrir como app web», si aparece, y tocá{" "}
          <UiLabel>Agregar</UiLabel>.
        </>
      ),
      images: [IOS_IMAGES.confirm],
    },
    { text: OPEN_FROM_ICON, images: [IOS_IMAGES.homeIcon] },
  ];
}

export const IOS_SAFARI_GUIDE: InstallGuideText = {
  steps: iosSteps({
    text: (
      <>
        En la barra de Safari, tocá el ícono que está a la izquierda de la
        dirección y elegí{" "}
        <UiLabel icon={<ShareIcon aria-hidden />}>Compartir</UiLabel>. Si ves el
        botón Compartir directo en la barra, tocalo.
      </>
    ),
    images: [IOS_IMAGES.addressBar, IOS_IMAGES.shareMenu],
  }),
};

/**
 * Step 2, for everyone: where the control is inside the installed app. Shown
 * whatever the flags say, so the page explains notifications before they
 * launch too; the screenshots are of Glitter's own screens, the same on any
 * phone.
 */
export const NOTIFICATIONS_GUIDE: InstallGuideText = {
  steps: [
    {
      text: (
        <>
          Abrí Glitter desde su ícono y tocá la campana{" "}
          <UiLabel icon={<BellIcon aria-hidden />} srLabel="Notificaciones" />,
          arriba.
        </>
      ),
      images: [IOS_IMAGES.bell],
    },
    {
      text: `Tocá el botón «${ENABLE_PUSH_LABEL}».`,
      images: [IOS_IMAGES.enablePush],
    },
    <>
      Cuando tu teléfono te pregunte si Glitter puede enviarte notificaciones,
      tocá <UiLabel>Permitir</UiLabel>.
    </>,
  ],
  note: "En iPhone y iPad las notificaciones llegan solo a Glitter instalado: por eso el paso 1.",
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
    note: "¿No aparece «Agregar a Inicio»? Abrí esta página en Safari y seguí los pasos desde ahí.",
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
  if (browser === "edge") {
    return {
      steps: [
        menu,
        "Elegí «Agregar al teléfono» o «Instalar app».",
        <>
          Confirmá con <UiLabel>Instalar</UiLabel>.
        </>,
        OPEN_FROM_ICON,
      ],
    };
  }
  // As current Chrome has it (Dennis's screenshots, 2026-11-03), with the
  // labels older versions used. The screenshots are Chrome's own; Opera
  // shares the steps but not the look.
  const shot = (text: ReactNode, image: StepImage): InstallStep =>
    browser === "chrome" ? { text, images: [image] } : text;
  return {
    steps: [
      shot(menu, ANDROID_IMAGES.menuButton),
      shot(
        "Elegí «Instalar y crear acceso directo» (en algunas versiones, «Instalar app» o «Agregar a la pantalla principal»).",
        ANDROID_IMAGES.installMenu,
      ),
      shot(
        <>
          Tocá <UiLabel>Instalar</UiLabel>, no «Crear acceso directo»: el acceso
          directo abre Glitter dentro de Chrome.
        </>,
        ANDROID_IMAGES.installSheet,
      ),
      shot(
        <>
          En «Instalar aplicación», confirmá con <UiLabel>Instalar</UiLabel>.
        </>,
        ANDROID_IMAGES.installDialog,
      ),
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

/** Screenshots are 924 px wide for a 390-point iPhone screen. */
const SCREENSHOT_SCALE = 924 / 390;

function isStepWithImages(
  step: InstallStep,
): step is { text: ReactNode; images: StepImage[] } {
  return (
    typeof step === "object" &&
    step !== null &&
    !isValidElement(step) &&
    "images" in step
  );
}

export function InstallStepList({ guide }: { guide: InstallGuideText }) {
  return (
    <div className="space-y-3">
      {guide.steps.length > 0 && (
        <ol className="space-y-4">
          {guide.steps.map((step, index) => {
            const { text, images } = isStepWithImages(step)
              ? step
              : { text: step, images: [] };
            return (
              <li key={index} className="flex gap-3 text-sm leading-relaxed">
                <span
                  aria-hidden
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                  <p>{text}</p>
                  {images.map((image) => (
                    <Image
                      key={image.src}
                      src={image.src}
                      width={image.width}
                      height={image.height}
                      alt={image.alt}
                      // As large as on the phone itself, never wider than
                      // the step.
                      style={{
                        width: Math.round(image.width / SCREENSHOT_SCALE),
                      }}
                      sizes={`${Math.round(image.width / SCREENSHOT_SCALE)}px`}
                      className="h-auto max-w-full rounded-lg border"
                    />
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {guide.note && (
        <p className="text-sm text-muted-foreground">{guide.note}</p>
      )}
    </div>
  );
}
