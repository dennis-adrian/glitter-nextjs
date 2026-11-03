import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
    expect(screen.getAllByText(/Agregar a inicio/).length).toBeGreaterThan(0);
    expect(installButton()).toBe(null);
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
    useBrowser(UA.windows);
    renderGuide();
    offerInstall("dismissed");
    fireEvent.click(installButton()!);

    await waitFor(() => expect(screen.getByText(/No pasa nada/)).toBeTruthy());
    expect(installButton()).toBe(null);
    expect(
      screen.getAllByText(/Instalar página como app/).length,
    ).toBeGreaterThan(0);
  });

  it("gives the menu steps when the browser has not offered to install", () => {
    useBrowser(UA.android);
    renderGuide();
    expect(screen.getByText(/Si ya instalaste Glitter/)).toBeTruthy();
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
      platform: "ios-safari",
      browser: "safari",
      push_available: true,
      signed_in: false,
    });
  });
});

describe("/instalar, step 2", () => {
  it("leaves notifications out before they launch for this viewer", () => {
    useBrowser(UA.windows);
    renderGuide({ pushAvailable: false });
    expect(screen.queryByText("Activá las notificaciones")).toBe(null);
  });

  it("asks a signed-out visitor to sign in, coming back here", () => {
    useBrowser(UA.windows);
    renderGuide({ signedIn: false });
    expect(
      screen.getByRole("link", { name: "Iniciar sesión" }).getAttribute("href"),
    ).toBe("/sign_in?redirect_url=%2Finstalar");
    expect(screen.queryByTestId("push-control")).toBe(null);
  });

  it("tells an iPhone where the control is once installed", () => {
    useBrowser(UA.iphone);
    renderGuide();
    expect(screen.getByText(/tocá la campana/)).toBeTruthy();
    expect(screen.queryByTestId("push-control")).toBe(null);
  });

  it("shows the notifications control where it can be used", () => {
    useBrowser(UA.windows);
    renderGuide();
    expect(screen.getByTestId("push-control")).toBeTruthy();
  });
});
