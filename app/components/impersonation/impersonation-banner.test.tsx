import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, forgetMock } = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true },
  forgetMock: vi.fn(async () => {}),
}));

vi.mock("@clerk/nextjs", () => ({ useAuth: () => auth }));
vi.mock("@/app/components/notifications/use-push-device", () => ({
  forgetThisBrowserForPush: forgetMock,
}));

import ImpersonationBanner from "@/app/components/impersonation/impersonation-banner";
import {
  prepareSignOut,
  setViewState,
  useViewState,
} from "@/app/components/impersonation/view-state";

const ANA = {
  id: 2,
  displayName: "Ana Pérez",
  firstName: "Ana",
  lastName: "Pérez",
  email: "ana@example.com",
  imageUrl: null,
};
const VIEW = { subject: ANA, secondsLeft: 1800 };

const fetchMock = vi.fn();
const replaceMock = vi.fn();

function respond(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => body } as Response);
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, replace: replaceMock },
  });
  fetchMock.mockReset();
  replaceMock.mockReset();
  forgetMock.mockClear();
  auth.isLoaded = true;
  auth.isSignedIn = true;
});

afterEach(() => {
  cleanup();
  act(() => setViewState(null));
  vi.useRealTimers();
  document.documentElement.style.removeProperty(
    "--impersonation-banner-height",
  );
});

describe("ImpersonationBanner", () => {
  it("renders nothing outside a view", () => {
    const { container } = render(<ImpersonationBanner initial={null} />);
    expect(container.innerHTML).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says whose app this is, that it is read-only, and offers Salir", () => {
    render(<ImpersonationBanner initial={VIEW} />);
    const banner = screen.getByRole("region", {
      name: "Vista como participante",
    });
    expect(banner.textContent).toContain("Estás viendo como Ana Pérez");
    expect(banner.textContent).toContain("solo lectura");
    expect(screen.getByRole("button", { name: "Salir" })).toBeTruthy();
  });

  it("is in the first render, before the page hydrates the store", () => {
    // The server's answer alone draws it: nothing set in the store yet.
    render(<ImpersonationBanner initial={VIEW} />);
    expect(screen.queryByRole("region")).not.toBeNull();
  });

  it("names the participant by email when they have no name", () => {
    render(
      <ImpersonationBanner
        initial={{
          ...VIEW,
          subject: {
            ...ANA,
            displayName: null,
            firstName: null,
            lastName: null,
          },
        }}
      />,
    );
    expect(screen.getByRole("region").textContent).toContain(
      "Estás viendo como ana@example.com",
    );
  });

  it("never writes in all caps", () => {
    render(<ImpersonationBanner initial={VIEW} />);
    const text = screen.getByRole("region").textContent ?? "";
    expect(text).not.toBe(text.toUpperCase());
    expect(text).not.toMatch(/SOLO LECTURA|SALIR/);
  });

  it("tells the rest of the page a view is on", () => {
    function Probe() {
      return <span data-testid="probe">{useViewState() ? "on" : "off"}</span>;
    }
    render(
      <>
        <ImpersonationBanner initial={VIEW} />
        <Probe />
      </>,
    );
    expect(screen.getByTestId("probe").textContent).toBe("on");
  });

  it("Salir ends the view and loads the admin's page as a new document", async () => {
    fetchMock.mockReturnValue(respond({ returnTo: "/dashboard/users/2" }));
    render(<ImpersonationBanner initial={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: "Salir" }));
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/dashboard/users/2"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/impersonation/exit",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reason: "exited" }),
      }),
    );
  });

  it("stays, and says so, when Salir fails", async () => {
    fetchMock.mockReturnValue(respond({}, false));
    render(<ImpersonationBanner initial={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: "Salir" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "No se pudo salir. Intentá de nuevo.",
      ),
    );
    expect(replaceMock).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("button", { name: "Salir" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("says the view ended when its hour runs out", () => {
    vi.useFakeTimers();
    render(<ImpersonationBanner initial={{ ...VIEW, secondsLeft: 60 }} />);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole("region").textContent).toContain(
      "La vista como Ana Pérez terminó",
    );
    expect(
      screen.getByRole("button", { name: "Volver a mi cuenta" }),
    ).toBeTruthy();
  });

  it("notices a view ended elsewhere when the tab comes back", async () => {
    fetchMock.mockReturnValue(respond({ active: false }));
    render(<ImpersonationBanner initial={VIEW} />);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() =>
      expect(screen.getByRole("region").textContent).toContain("terminó"),
    );
  });

  it("draws the page again when another tab switched to someone else", async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, replace: replaceMock, reload: reloadMock },
    });
    fetchMock.mockReturnValue(
      respond({ active: true, secondsLeft: 900, subject: { ...ANA, id: 9 } }),
    );
    render(<ImpersonationBanner initial={VIEW} />);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(reloadMock).toHaveBeenCalled());
  });

  it("keeps the banner as it is when the server cannot tell", async () => {
    fetchMock.mockReturnValue(respond({ error: "unavailable" }, false));
    render(<ImpersonationBanner initial={VIEW} />);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByRole("region").textContent).toContain(
      "Estás viendo como",
    );
  });

  it("asks the server on a page rendered without a request", async () => {
    fetchMock.mockReturnValue(
      respond({ active: true, secondsLeft: 900, subject: ANA }),
    );
    render(<ImpersonationBanner initial={null} probe />);
    await waitFor(() =>
      expect(screen.getByRole("region").textContent).toContain("Ana Pérez"),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/impersonation", {
      cache: "no-store",
    });
  });

  it("does not ask for a signed-out visitor", () => {
    auth.isSignedIn = false;
    render(<ImpersonationBanner initial={null} probe />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("publishes its height for what sits below the navbar", () => {
    render(<ImpersonationBanner initial={VIEW} />);
    expect(
      document.documentElement.style.getPropertyValue(
        "--impersonation-banner-height",
      ),
    ).toMatch(/px$/);
    cleanup();
    expect(
      document.documentElement.style.getPropertyValue(
        "--impersonation-banner-height",
      ),
    ).toBe("");
  });
});

describe("other tabs", () => {
  function stubLocation() {
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, replace: replaceMock, reload: reloadMock },
    });
    return reloadMock;
  }

  it("draw themselves again when a view starts or ends elsewhere", async () => {
    const reloadMock = stubLocation();
    // A tab outside any view listens too; the message is another tab's.
    render(<ImpersonationBanner initial={null} />);
    const other = new BroadcastChannel("glitter:impersonation");
    other.postMessage({ from: "another-tab" });
    other.close();
    await waitFor(() => expect(reloadMock).toHaveBeenCalled());
  });

  it("are told when this tab leaves, and this tab does not reload itself", async () => {
    const reloadMock = stubLocation();
    fetchMock.mockReturnValue(respond({ returnTo: "/dashboard", ended: true }));
    const heard = vi.fn();
    const channel = new BroadcastChannel("glitter:impersonation");
    channel.onmessage = heard;
    render(<ImpersonationBanner initial={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: "Salir" }));
    await waitFor(() => expect(heard).toHaveBeenCalled());
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/dashboard"));
    // Time for a stray self-message to arrive, were there one.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(reloadMock).not.toHaveBeenCalled();
    channel.close();
  });
});

describe("an ordinary sign-out", () => {
  it("tells no other tab anything when no view ended", async () => {
    fetchMock.mockReturnValue(respond({ returnTo: "/", ended: false }));
    const heard = vi.fn();
    const channel = new BroadcastChannel("glitter:impersonation");
    channel.onmessage = heard;
    await prepareSignOut();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(heard).not.toHaveBeenCalled();
    channel.close();
  });
});

describe("prepareSignOut", () => {
  it("ends the view as a sign-out, then forgets avisos for the admin", async () => {
    const order: string[] = [];
    fetchMock.mockImplementation(() => {
      order.push("exit");
      return respond({ returnTo: "/" });
    });
    forgetMock.mockImplementation(async () => {
      order.push("forget");
    });
    act(() => setViewState(VIEW));
    await prepareSignOut();
    expect(order).toEqual(["exit", "forget"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/impersonation/exit",
      expect.objectContaining({
        body: JSON.stringify({ reason: "signed_out" }),
      }),
    );
  });

  it("never holds the sign-out up when the exit fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(prepareSignOut()).resolves.toBeUndefined();
    expect(forgetMock).toHaveBeenCalled();
  });
});
