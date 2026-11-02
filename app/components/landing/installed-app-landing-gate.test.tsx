import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import InstalledAppLandingGate from "@/app/components/landing/installed-app-landing-gate";

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

function displayMode(standalone: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: standalone && query === "(display-mode: standalone)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  replaceMock.mockReset();
  displayMode(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window.navigator as Navigator & { standalone?: boolean }).standalone;
});

function renderGate() {
  return render(
    <InstalledAppLandingGate>
      <h1>Creamos festivales</h1>
    </InstalledAppLandingGate>,
  );
}

describe("InstalledAppLandingGate", () => {
  it("leaves the landing alone in a browser tab", () => {
    renderGate();

    expect(replaceMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Creamos festivales" }),
    ).toBeTruthy();
  });

  it("sends the installed app to sign in", () => {
    displayMode(true);
    renderGate();

    expect(replaceMock).toHaveBeenCalledWith("/sign_in");
  });

  it("recognises an iPhone home-screen app that only reports navigator.standalone", () => {
    Object.defineProperty(window.navigator, "standalone", {
      value: true,
      configurable: true,
    });
    renderGate();

    expect(replaceMock).toHaveBeenCalledWith("/sign_in");
  });

  it("hides the landing from the first paint in standalone mode, by CSS", () => {
    const { container } = renderGate();
    const landing = screen.getByRole("heading", {
      name: "Creamos festivales",
    }).parentElement!;
    const status = screen.getByRole("status");

    expect(landing.classList.contains("standalone:hidden")).toBe(true);
    expect(status.classList.contains("hidden")).toBe(true);
    expect(status.classList.contains("standalone:flex")).toBe(true);
    expect(container.textContent).toContain("Abriendo Glitter");
  });
});
