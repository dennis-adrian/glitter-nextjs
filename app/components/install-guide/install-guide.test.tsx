import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ capture: vi.fn() }));

vi.mock("@/app/lib/posthog-capture", () => ({
  captureClientEvent: mocks.capture,
}));
// The control's server actions; the guide never calls them itself.
vi.mock("@/app/lib/notifications/push/actions", () => ({
  savePushDeviceAction: vi.fn(),
  removePushDeviceAction: vi.fn(),
  forgetPushDeviceAction: vi.fn(),
  releaseForeignPushDeviceAction: vi.fn(),
}));
// The control has its own tests; here it only has to show up in step 2.
vi.mock("@/app/components/notifications/push-control", () => ({
  ENABLE_PUSH_LABEL: "Recibir notificaciones en este dispositivo",
  PushControl: () => <div data-testid="push-control" />,
}));

import InstallGuide, {
  INSTALL_BUTTON_LABEL,
} from "@/app/components/install-guide/install-guide";
import { listenForInstallPrompt } from "@/app/lib/install-guide/install-prompt";

const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.18.94 (iPhone15,2; iOS 17_4; es_LA; es; scale=3.00; 1179x2556)",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
};

const originalUserAgent = navigator.userAgent;
let stopListening: () => void = () => {};

function useBrowser(userAgent: string, { standalone = false } = {}) {
  Object.defineProperty(window.navigator, "userAgent", {
    value: userAgent,
    configurable: true,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: standalone && query === "(display-mode: standalone)",
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

function offerInstall(outcome: "accepted" | "dismissed") {
  const event = new Event("beforeinstallprompt") as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = vi.fn(async () => {});
  event.userChoice = Promise.resolve({ outcome });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

function renderGuide(
  props: Partial<React.ComponentProps<typeof InstallGuide>> = {},
) {
  return render(
    <InstallGuide
      pushAvailable
      signedIn
      publicKey="key"
      devices={[]}
      installUrl="https://www.glitter.com.bo/instalar"
      qrSvg='<svg data-testid="qr"></svg>'
      {...props}
    />,
  );
}

const installButton = () =>
  screen.queryByRole("button", { name: INSTALL_BUTTON_LABEL });

beforeEach(() => {
  delete window.__glitterInstallPrompt;
  // As instrumentation-client.ts does, before the page renders.
  stopListening = listenForInstallPrompt();
});

afterEach(() => {
  cleanup();
  stopListening();
  delete window.__glitterInstallPrompt;
  Object.defineProperty(window.navigator, "userAgent", {
    value: originalUserAgent,
    configurable: true,
  });
  mocks.capture.mockReset();
});

describe("/instalar, step 1", () => {
  it("shows an iPhone the home-screen steps, with no button it could not use", () => {
    useBrowser(UA.iphone);
    renderGuide();
    expect(screen.getAllByText(/Agregar a Inicio/).length).toBeGreaterThan(0);
    expect(installButton()).toBe(null);
  });

  it("shows each iPhone step with its screenshot, as iOS 26 Safari has it", () => {
    useBrowser(UA.iphone);
    renderGuide();
    const step1 = document
      .getElementById("install-step-heading")
      ?.closest("section")
      ?.querySelector("ol > li");
    expect(step1?.textContent).toMatch(/a la izquierda de la dirección/);
    for (const alt of [
      /ícono a la izquierda de la dirección marcado/,
      /con «Compartir» marcado/,
      /con «Ver más» marcado/,
      /con «Agregar a Inicio» marcado/,
      /«Abrir como app web» activado/,
      /ícono de Glitter en la pantalla de inicio/,
    ]) {
      const image = screen.getByAltText(alt);
      expect(image.getAttribute("src")).toMatch(/install-guide/);
    }
  });

  it("asks Instagram's browser to open the page elsewhere, with the link to copy", () => {
    useBrowser(UA.iphoneInstagram);
    renderGuide();
    expect(screen.getByText(/Abrir en navegador externo/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copiar enlace" })).toBeTruthy();
    expect(screen.getByText("http://localhost:3000/instalar")).toBeTruthy();
  });

  it("offers the Instalar button on Android once the browser can install", async () => {
    useBrowser(UA.android);
    renderGuide();
    expect(installButton()).toBe(null);

    const event = offerInstall("accepted");
    fireEvent.click(installButton()!);

    await waitFor(() =>
      expect(screen.getByText(/Glitter quedó instalado/)).toBeTruthy(),
    );
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenCalledWith("install_prompt_answered", {
      outcome: "accepted",
      platform: "android",
      browser: "chrome",
    });
  });

  it("falls back to the menu steps when the prompt is dismissed", async () => {
    useBrowser(UA.android);
    renderGuide();
    offerInstall("dismissed");
    fireEvent.click(installButton()!);

    await waitFor(() => expect(screen.getByText(/No pasa nada/)).toBeTruthy());
    expect(installButton()).toBe(null);
    expect(
      screen.getAllByText(/Agregar a la pantalla principal/).length,
    ).toBeGreaterThan(0);
  });

  it("sends a computer to its phone with a QR code, even when Chrome offers to install", () => {
    useBrowser(UA.windows);
    renderGuide();
    offerInstall("accepted");

    expect(screen.getByText("Glitter se instala en tu teléfono.")).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: "Código QR que abre www.glitter.com.bo/instalar",
      }),
    ).toBeTruthy();
    expect(screen.getByText("www.glitter.com.bo/instalar")).toBeTruthy();
    // The server's drawing, inside the labelled frame.
    expect(screen.getByTestId("qr")).toBeTruthy();
    expect(installButton()).toBe(null);
    // The steps for both phones, and nothing about computers.
    expect(screen.getByText("Los pasos en cada teléfono")).toBeTruthy();
    expect(screen.getByText("iPhone y iPad")).toBeTruthy();
    expect(screen.getByText("Android")).toBeTruthy();
    expect(screen.queryByText(/Computadora|Mac/)).toBe(null);
  });

  it("gives a computer the address alone when the QR code could not be drawn", () => {
    useBrowser(UA.windows);
    renderGuide({ qrSvg: null });
    expect(screen.queryByRole("img", { name: /Código QR/ })).toBe(null);
    expect(screen.getByText(/Abrí esta página en tu teléfono/)).toBeTruthy();
    expect(screen.getByText("www.glitter.com.bo/instalar")).toBeTruthy();
  });

  it("draws a computer as one from the server", () => {
    const html = renderToString(
      <InstallGuide
        pushAvailable
        signedIn={false}
        publicKey="key"
        devices={[]}
        installUrl="https://www.glitter.com.bo/instalar"
        qrSvg="<svg></svg>"
        serverGuess={{ platform: "desktop", browser: "chrome" }}
      />,
    );
    expect(html).toContain("Glitter se instala en tu teléfono.");
    expect(html).toContain("Los pasos en cada teléfono");
    expect(html).not.toContain("¿Usás otro teléfono?");
    // The notifications tutorial, for the phone, but never the control.
    expect(html).toContain("Activá las notificaciones");
    expect(html).not.toContain("push-control");
  });

  it("does not call the installed app a phone, which may be a computer", () => {
    useBrowser(UA.windows, { standalone: true });
    renderGuide();
    expect(screen.getByText(/Ya estás usando Glitter instalado/)).toBeTruthy();
    expect(screen.getByText("Los pasos en cada teléfono")).toBeTruthy();
  });

  it("lists only the other phone's steps on a phone", () => {
    useBrowser(UA.iphone);
    renderGuide();
    expect(screen.getByText("¿Usás otro teléfono?")).toBeTruthy();
    expect(screen.getByText("Android")).toBeTruthy();
    expect(screen.queryByText("iPhone y iPad")).toBe(null);
  });

  it("gives the menu steps when the browser has not offered to install", () => {
    useBrowser(UA.android);
    renderGuide();
    expect(screen.getByText(/Si ya instalaste Glitter/)).toBeTruthy();
    // Current Chrome's labels: the menu entry, then «Instalar», not the
    // shortcut.
    expect(
      screen.getAllByText(/«Instalar y crear acceso directo»/).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/no «Crear acceso directo»/).length,
    ).toBeGreaterThan(0);
    for (const alt of [
      /botón de menú \(tres puntos\) marcado/,
      /con «Instalar y crear acceso directo» marcado/,
      /con «Instalar» marcado y «Crear acceso directo» debajo/,
      /«Instalar aplicación» de Glitter/,
    ]) {
      expect(screen.getAllByAltText(alt)[0].getAttribute("src")).toMatch(
        /android-\d-[a-z-]+\.webp/,
      );
    }
    expect(
      screen.getAllByText(/Agregar a la pantalla principal/).length,
    ).toBeGreaterThan(0);
  });

  it("says so when the page is already the installed app", () => {
    useBrowser(UA.android, { standalone: true });
    renderGuide();
    expect(screen.getByText(/Ya estás usando Glitter instalado/)).toBeTruthy();
  });

  it("counts the view once, with the platform", () => {
    useBrowser(UA.iphone);
    renderGuide({ signedIn: false });
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenCalledWith("install_guide_viewed", {
      platform: "ios",
      platform_detail: "ios-safari",
      browser: "safari",
      push_available: true,
      signed_in: false,
    });
  });
});

describe("/instalar, step 2", () => {
  /** The tutorial's three steps, as every viewer gets them. */
  function expectTutorial() {
    expect(screen.getByText("Activá las notificaciones")).toBeTruthy();
    expect(screen.getByText(/tocá la campana/)).toBeTruthy();
    expect(screen.getByAltText(/con la campana marcada/)).toBeTruthy();
    expect(
      screen.getByAltText(
        /con el botón «Recibir notificaciones en este dispositivo» marcado/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/Cuando tu teléfono te pregunte/).textContent,
    ).toMatch(/Permitir/);
  }

  it("explains notifications before they launch, without the control", () => {
    useBrowser(UA.android);
    renderGuide({ pushAvailable: false });
    expectTutorial();
    expect(screen.queryByTestId("push-control")).toBe(null);
  });

  it("never asks a signed-out visitor to sign in: the tutorial only", () => {
    useBrowser(UA.android);
    renderGuide({ signedIn: false });
    expectTutorial();
    expect(screen.queryByRole("link", { name: /Iniciar sesión/ })).toBe(null);
    expect(screen.queryByText(/Iniciá sesión con tu cuenta/)).toBe(null);
    expect(screen.queryByTestId("push-control")).toBe(null);
  });

  it("gives an iPhone outside the installed app the tutorial, not the control", () => {
    useBrowser(UA.iphone);
    renderGuide();
    expectTutorial();
    expect(screen.queryByTestId("push-control")).toBe(null);
  });

  it("adds the control as a shortcut where it can be used", () => {
    useBrowser(UA.android);
    renderGuide();
    expectTutorial();
    expect(screen.getByTestId("push-control")).toBeTruthy();
  });

  it("gives a computer the tutorial for the phone, without the control", () => {
    useBrowser(UA.windows);
    renderGuide();
    expectTutorial();
    expect(screen.queryByTestId("push-control")).toBe(null);
  });
});
