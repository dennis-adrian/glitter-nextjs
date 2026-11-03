import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  savePushDeviceAction: vi.fn(),
  removePushDeviceAction: vi.fn(),
  forgetPushDeviceAction: vi.fn(),
  releaseForeignPushDeviceAction: vi.fn(),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

// The control's server actions, standing in for the database behind them.
vi.mock("@/app/lib/notifications/push/actions", () => ({
  savePushDeviceAction: mocks.savePushDeviceAction,
  removePushDeviceAction: mocks.removePushDeviceAction,
  forgetPushDeviceAction: mocks.forgetPushDeviceAction,
  releaseForeignPushDeviceAction: mocks.releaseForeignPushDeviceAction,
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

import {
  ENABLE_PUSH_LABEL,
  PushControl,
  type PushDeviceRow,
  PushOffer,
} from "@/app/components/notifications/push-control";
import {
  forgetThisBrowserForPush,
  useReleaseForeignPushDevice,
} from "@/app/components/notifications/use-push-device";

// Uncompressed P-256 points, as a VAPID public key and a browser's p256dh.
const KEY =
  "BLgq3Kb1Gves7HFtbAjQPtfZCKgsumjcLy7Wlc4wfsMnEk58tPLXQKOrIKjn0Vbl5ZbdFPsmDHHbeQCqUZC-ki0";
const OLD_KEY =
  "BL-hc73UULNNTZYC6xcVjHej5vKkNY284cG1JJKuMGObrAwrQiDl_cCXFzkYxfTRnBkWJG2AAV1db4_zrezG0Zs";
const P256DH =
  "BP9Cfh4B6Xmtj2a1DFQKhOHJD2kIHh_O7CnG7tEpQgiKCBvEEcsyo3ayKULYSsmwcov8cXUxzJ3fGov18j_dMnY";
const AUTH = "1lvW7z5gTkxyJKHHMYEFeA";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/dQw4w9WgXcQ:APA91bE";

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPHONE_16_3 =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.18.94 (iPhone15,2; iOS 17_4; es_LA; es; scale=3.00; 1179x2556)";

const ENABLED_TOAST =
  "Listo, vas a recibir notificaciones en este dispositivo.";
const DISABLED_TOAST =
  "Ya no vas a recibir notificaciones en este dispositivo.";
const DISABLE_LABEL = "Dejar de recibir notificaciones en este dispositivo";
const ON_STATUS = "Este dispositivo recibe tus notificaciones.";

const DEVICES: PushDeviceRow[] = [
  { id: 7, label: "Chrome en Windows", lastUsedLabel: "hoy" },
  { id: 9, label: "iPhone", lastUsedLabel: "hace 3 días" },
];

function keyBytes(key: string) {
  return Uint8Array.from(Buffer.from(key, "base64url"));
}

/** What happened, in order, across the browser and the server. */
let calls: string[] = [];

/** The rows the server holds: endpoint → device id. */
let savedDevices = new Map<string, number>();

type FakeSubscription = {
  endpoint: string;
  options: { applicationServerKey: ArrayBuffer };
  toJSON: () => {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  unsubscribe: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
};

const navigatorOverrides: string[] = [];

function setNavigator(key: string, value: unknown) {
  Object.defineProperty(navigator, key, { configurable: true, value });
  navigatorOverrides.push(key);
}

/**
 * jsdom has no service worker, Push API, Notification or matchMedia: this
 * stands in for a browser that does, as far as the control reaches into it.
 */
function installBrowser({
  permission = "default",
  userAgent = CHROME_WINDOWS,
  standalone = false,
  serviceWorker = true,
  pushManager = true,
  subscribedWith = null,
}: {
  permission?: NotificationPermission;
  userAgent?: string;
  standalone?: boolean;
  serviceWorker?: boolean;
  pushManager?: boolean;
  /** The key of a subscription this browser already holds. */
  subscribedWith?: string | null;
} = {}) {
  function subscriptionWith(key: Uint8Array): FakeSubscription {
    const subscription: FakeSubscription = {
      endpoint: ENDPOINT,
      options: { applicationServerKey: Uint8Array.from(key).buffer },
      toJSON: () => ({
        endpoint: ENDPOINT,
        keys: { p256dh: P256DH, auth: AUTH },
      }),
      unsubscribe: vi.fn(async () => {
        calls.push("unsubscribe");
        if (browser.subscription === subscription) browser.subscription = null;
        return true;
      }),
    };
    return subscription;
  }

  const pushManagerFake = {
    getSubscription: vi.fn(async () => browser.subscription),
    subscribe: vi.fn(
      async (options: {
        userVisibleOnly: boolean;
        applicationServerKey: Uint8Array;
      }) => {
        calls.push("subscribe");
        browser.subscription = subscriptionWith(options.applicationServerKey);
        return browser.subscription;
      },
    ),
  };
  const registration = { pushManager: pushManagerFake };

  const browser = {
    permission,
    subscription: null as FakeSubscription | null,
    requestPermission: vi.fn(
      async (): Promise<NotificationPermission> => browser.permission,
    ),
    /** Answers the prompt the way the person does. */
    answerPrompt(answer: NotificationPermission) {
      browser.requestPermission.mockImplementation(async () => {
        browser.permission = answer;
        return answer;
      });
    },
    pushManager: pushManagerFake,
    registration,
    serviceWorker: {
      register: vi.fn<
        (url: string, options?: object) => Promise<typeof registration>
      >(async () => registration),
      ready: Promise.resolve(registration),
      getRegistration: vi.fn(
        async (): Promise<typeof registration | undefined> => registration,
      ),
    },
  };
  if (subscribedWith)
    browser.subscription = subscriptionWith(keyBytes(subscribedWith));

  vi.stubGlobal("Notification", {
    get permission() {
      return browser.permission;
    },
    requestPermission: browser.requestPermission,
  });
  if (pushManager) vi.stubGlobal("PushManager", class PushManager {});
  if (serviceWorker) setNavigator("serviceWorker", browser.serviceWorker);
  setNavigator("userAgent", userAgent);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: standalone && query === "(display-mode: standalone)",
    addEventListener() {},
    removeEventListener() {},
  }));
  return browser;
}

/** Lets the pending browser and server promises, and React, catch up. */
async function settle() {
  for (let round = 0; round < 3; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** Ends what tests leave open; see `openUntilTheTestEnds`. */
const endsAfterTheTest: Array<() => void> = [];

/**
 * A prompt left open, or a worker that never activates, for as long as the
 * test runs; then it fails, so the operation waiting on it ends. The controls
 * share whether one is in flight, and one stuck would block the next test.
 */
function openUntilTheTestEnds<T>(): Promise<T> {
  return new Promise<T>((_, reject) => {
    endsAfterTheTest.push(() => reject(new Error("The test is over")));
  });
}

function enableButton() {
  return screen.queryByRole("button", {
    name: ENABLE_PUSH_LABEL,
  }) as HTMLButtonElement | null;
}

/** Whether there is a button that would turn avisos on right now. */
function canTurnOn() {
  const button = enableButton();
  return button != null && !button.disabled;
}

async function enabledButton() {
  await waitFor(() => expect(canTurnOn()).toBe(true));
  return enableButton() as HTMLButtonElement;
}

function deviceRow(label: string) {
  return screen.getByText(label).closest("li") as HTMLElement;
}

beforeEach(() => {
  calls = [];
  savedDevices = new Map();
  mocks.savePushDeviceAction.mockImplementation(
    async (input: { endpoint: string; refreshOnly?: boolean }) => {
      calls.push(input.refreshOnly ? "refresh" : "save");
      if (input.refreshOnly) {
        return {
          success: true,
          deviceId: savedDevices.get(input.endpoint) ?? null,
        };
      }
      savedDevices.set(input.endpoint, 7);
      return { success: true, deviceId: 7 };
    },
  );
  mocks.removePushDeviceAction.mockImplementation(async (id: number) => {
    calls.push(`remove:${id}`);
    for (const [endpoint, saved] of savedDevices) {
      if (saved === id) savedDevices.delete(endpoint);
    }
    return { success: true };
  });
  mocks.forgetPushDeviceAction.mockImplementation(async (endpoint: string) => {
    calls.push("forget");
    savedDevices.delete(endpoint);
    return { success: true };
  });
  mocks.releaseForeignPushDeviceAction.mockResolvedValue({
    success: true,
    released: false,
  });
});

afterEach(async () => {
  vi.useRealTimers();
  const open = endsAfterTheTest.splice(0);
  for (const end of open) end();
  if (open.length > 0) await settle();
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const key of navigatorOverrides.splice(0)) {
    delete (navigator as unknown as Record<string, unknown>)[key];
  }
  sessionStorage.clear();
  mocks.savePushDeviceAction.mockReset();
  mocks.removePushDeviceAction.mockReset();
  mocks.forgetPushDeviceAction.mockReset();
  mocks.releaseForeignPushDeviceAction.mockReset();
  mocks.refresh.mockReset();
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
});

describe("the avisos control on /my_notifications", () => {
  it("renders no button on the server, before the browser can be asked", () => {
    installBrowser();
    const html = renderToString(
      <PushControl publicKey={KEY} devices={DEVICES} />,
    );
    expect(html.includes("Notificaciones en este dispositivo")).toBe(true);
    expect(html.includes("Recibir notificaciones")).toBe(false);
    expect(html.includes("Dejar de recibir")).toBe(false);
  });

  it("offers to turn avisos on in a browser that has not been asked yet", async () => {
    installBrowser();
    render(<PushControl publicKey={KEY} devices={[]} />);
    await enabledButton();
    expect(
      screen.getByText(/aunque no tengas Glitter abierto/).textContent,
    ).toBeTruthy();
  });

  it("asks for the permission inside the tap, before anything is awaited", async () => {
    const browser = installBrowser();
    // The prompt stays open: nothing after it may have run yet.
    browser.requestPermission.mockReturnValue(openUntilTheTestEnds());
    render(<PushControl publicKey={KEY} devices={[]} />);
    const button = await enabledButton();
    const registrations = browser.serviceWorker.register.mock.calls.length;

    fireEvent.click(button);

    expect(browser.requestPermission).toHaveBeenCalledTimes(1);
    expect(browser.serviceWorker.register.mock.calls.length).toBe(
      registrations,
    );
    expect(browser.pushManager.subscribe).not.toHaveBeenCalled();
    expect(enableButton()?.getAttribute("aria-busy")).toBe("true");
    expect(enableButton()?.disabled).toBe(true);
  });

  it("on yes, subscribes with Glitter's key once the worker is active, saves the device and refreshes the page", async () => {
    const browser = installBrowser();
    browser.answerPrompt("granted");
    let activate = () => {};
    browser.serviceWorker.ready = new Promise((resolve) => {
      activate = () => resolve(browser.registration);
    });
    render(<PushControl publicKey={KEY} devices={[]} />);

    fireEvent.click(await enabledButton());
    await settle();
    // The worker is not active yet: subscribing would fail.
    expect(browser.pushManager.subscribe).not.toHaveBeenCalled();

    activate();
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(ENABLED_TOAST),
    );
    expect(browser.serviceWorker.register).toHaveBeenCalledWith("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    expect(browser.pushManager.subscribe).toHaveBeenCalledTimes(1);
    const [options] = browser.pushManager.subscribe.mock.calls[0];
    expect(options.userVisibleOnly).toBe(true);
    expect(Array.from(options.applicationServerKey)).toEqual(
      Array.from(keyBytes(KEY)),
    );
    expect(options.applicationServerKey.length).toBe(65);
    expect(mocks.savePushDeviceAction).toHaveBeenCalledWith({
      endpoint: ENDPOINT,
      keys: { p256dh: P256DH, auth: AUTH },
      label: "Chrome en Windows",
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect((await screen.findByText(ON_STATUS)).textContent).toBe(ON_STATUS);
    expect(screen.getByRole("button", { name: DISABLE_LABEL })).toBeTruthy();
  });

  // Answering the prompt changes the permission, which re-runs the
  // subscription check while `enable` is still subscribing and saving.
  it("stays busy from the tap until the device is saved, also once the prompt is answered", async () => {
    const browser = installBrowser();
    browser.answerPrompt("granted");
    browser.serviceWorker.ready = openUntilTheTestEnds();
    render(<PushControl publicKey={KEY} devices={[]} />);

    fireEvent.click(await enabledButton());
    await settle();

    expect(enableButton()?.getAttribute("aria-busy")).toBe("true");
    expect(canTurnOn()).toBe(false);
  });

  it("leaves the new subscription alone when that check finds it before the device is saved, and checks again once saved", async () => {
    const browser = installBrowser();
    browser.answerPrompt("granted");
    render(<PushControl publicKey={KEY} devices={[]} />);
    const button = await enabledButton();
    const registrations: Array<() => void> = [];
    browser.serviceWorker.register.mockImplementation(
      () =>
        new Promise((resolve) =>
          registrations.push(() => resolve(browser.registration)),
        ),
    );
    let finishSave = () => {};
    const save = mocks.savePushDeviceAction.getMockImplementation()!;
    mocks.savePushDeviceAction.mockImplementation(
      async (input: { refreshOnly?: boolean }) => {
        if (!input.refreshOnly) {
          await new Promise<void>((resolve) => {
            finishSave = resolve;
          });
        }
        return save(input);
      },
    );

    fireEvent.click(button);
    await settle();
    // The check the granted permission set off registers first, then the
    // tap's own flow, which subscribes and starts saving the device.
    expect(registrations).toHaveLength(2);
    registrations[1]();
    await settle();
    expect(calls).toEqual(["subscribe"]);
    // The check then finds the subscription whose device is still being saved.
    registrations[0]();
    await settle();
    browser.serviceWorker.register.mockImplementation(
      async () => browser.registration,
    );
    finishSave();

    await waitFor(() =>
      expect(calls).toEqual(["subscribe", "save", "refresh"]),
    );
    expect(browser.subscription).toBeTruthy();
    expect((await screen.findByText(ON_STATUS)).textContent).toBe(ON_STATUS);
  });

  it("takes a declined prompt as an answer: no error, and the control explains the block", async () => {
    const browser = installBrowser();
    browser.answerPrompt("denied");
    render(<PushControl publicKey={KEY} devices={[]} />);

    fireEvent.click(await enabledButton());

    await screen.findByText(/bloqueadas en este navegador/);
    await settle();
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(browser.pushManager.subscribe).not.toHaveBeenCalled();
    expect(mocks.savePushDeviceAction).not.toHaveBeenCalled();
    expect(canTurnOn()).toBe(false);
  });

  it("unsubscribes the browser again when the server refuses the device, and says why", async () => {
    const browser = installBrowser({ permission: "granted" });
    mocks.savePushDeviceAction.mockImplementation(async () => {
      calls.push("save");
      return {
        success: false,
        message: "Hiciste demasiados intentos. Esperá un minuto.",
      };
    });
    render(<PushControl publicKey={KEY} devices={[]} />);

    fireEvent.click(await enabledButton());

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Hiciste demasiados intentos. Esperá un minuto.",
      ),
    );
    expect(calls).toEqual(["subscribe", "save", "unsubscribe"]);
    expect(browser.subscription).toBe(null);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    await enabledButton();
  });

  it("unsubscribes the browser again when saving the device fails outright", async () => {
    const browser = installBrowser({ permission: "granted" });
    mocks.savePushDeviceAction.mockRejectedValue(new Error("offline"));
    render(<PushControl publicKey={KEY} devices={[]} />);

    fireEvent.click(await enabledButton());

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "No pudimos activar las notificaciones en este dispositivo. Intentá de nuevo.",
      ),
    );
    expect(browser.subscription).toBe(null);
    await enabledButton();
  });

  it("says it could not turn avisos on when the browser refuses to subscribe", async () => {
    const browser = installBrowser({ permission: "granted" });
    browser.pushManager.subscribe.mockRejectedValue(new Error("AbortError"));
    render(<PushControl publicKey={KEY} devices={[]} />);

    fireEvent.click(await enabledButton());

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "No pudimos activar las notificaciones en este dispositivo. Intentá de nuevo.",
      ),
    );
    expect(mocks.savePushDeviceAction).not.toHaveBeenCalled();
    await enabledButton();
  });

  describe("when it cannot be used here", () => {
    it("explains a block in the browser's settings, with the button disabled", async () => {
      const browser = installBrowser({ permission: "denied" });
      render(<PushControl publicKey={KEY} devices={[]} />);
      expect(
        screen.getByText(/Las notificaciones de Glitter están bloqueadas/)
          .textContent,
      ).toBeTruthy();
      expect(enableButton()?.disabled).toBe(true);
      await settle();
      expect(browser.serviceWorker.register).not.toHaveBeenCalled();
    });

    it("points an iPhone at its Settings app when avisos were turned off there", () => {
      installBrowser({
        permission: "denied",
        userAgent: IPHONE,
        standalone: true,
      });
      render(<PushControl publicKey={KEY} devices={[]} />);
      expect(
        screen.getByText(/Configuración › Notificaciones › Glitter/)
          .textContent,
      ).toBeTruthy();
      expect(canTurnOn()).toBe(false);
    });

    it("shows the home-screen steps on an iPhone in a Safari tab, with no way to turn avisos on", () => {
      // Safari tabs on iOS have no Push API; only the home-screen app does.
      installBrowser({
        userAgent: IPHONE,
        serviceWorker: true,
        pushManager: false,
      });
      render(<PushControl publicKey={KEY} devices={[]} />);
      expect(screen.getByText(/«Agregar a inicio»/).textContent).toBeTruthy();
      // The steps instead of a button it could never use there.
      expect(screen.queryByRole("button", { name: ENABLE_PUSH_LABEL })).toBe(
        null,
      );
    });

    it("offers the button on an iPhone once Glitter opens from the home screen", async () => {
      installBrowser({ userAgent: IPHONE, standalone: true });
      render(<PushControl publicKey={KEY} devices={[]} />);
      await enabledButton();
      expect(screen.queryByText(/«Agregar a inicio»/)).toBe(null);
    });

    it("asks for iOS 16.4 on an older iPhone", () => {
      installBrowser({ userAgent: IPHONE_16_3, standalone: true });
      render(<PushControl publicKey={KEY} devices={[]} />);
      expect(screen.getByText(/iOS 16.4 o posterior/).textContent).toBeTruthy();
      expect(canTurnOn()).toBe(false);
    });

    it("sends Instagram's browser on an iPhone to Safari", () => {
      installBrowser({ userAgent: IPHONE_INSTAGRAM, pushManager: false });
      render(<PushControl publicKey={KEY} devices={[]} />);
      expect(
        screen.getByText(/Abrí esta página en Safari/).textContent,
      ).toBeTruthy();
      expect(canTurnOn()).toBe(false);
    });

    it("says so in a browser without the Push API", () => {
      installBrowser({ pushManager: false });
      render(<PushControl publicKey={KEY} devices={[]} />);
      expect(
        screen.getByText(/Este navegador no puede recibir notificaciones/)
          .textContent,
      ).toBeTruthy();
      expect(enableButton()?.disabled).toBe(true);
    });

    it("says avisos are not available when this environment has no key", async () => {
      const browser = installBrowser();
      render(<PushControl publicKey={null} devices={[]} />);
      expect(
        screen.getByText("Las notificaciones no están disponibles por ahora.")
          .textContent,
      ).toBeTruthy();
      expect(enableButton()?.disabled).toBe(true);
      await settle();
      expect(browser.serviceWorker.register).not.toHaveBeenCalled();
    });
  });

  describe("on a later visit", () => {
    it("refreshes a subscription made with the current key and marks this device in the list", async () => {
      installBrowser({ permission: "granted", subscribedWith: KEY });
      savedDevices.set(ENDPOINT, 7);
      render(<PushControl publicKey={KEY} devices={DEVICES} />);

      await screen.findByText(ON_STATUS);
      expect(mocks.savePushDeviceAction).toHaveBeenCalledTimes(1);
      expect(mocks.savePushDeviceAction).toHaveBeenCalledWith({
        endpoint: ENDPOINT,
        keys: { p256dh: P256DH, auth: AUTH },
        label: "Chrome en Windows",
        refreshOnly: true,
      });
      expect(
        within(deviceRow("Chrome en Windows")).getByText("Este dispositivo"),
      ).toBeTruthy();
      expect(within(deviceRow("iPhone")).queryByText("Este dispositivo")).toBe(
        null,
      );
      expect(screen.getByRole("button", { name: DISABLE_LABEL })).toBeTruthy();
      expect(enableButton()).toBe(null);
    });

    it("shrinks to one line once on, with the devices folded away", async () => {
      installBrowser({ permission: "granted", subscribedWith: KEY });
      savedDevices.set(ENDPOINT, 7);
      const { container } = render(
        <PushControl publicKey={KEY} devices={DEVICES} />,
      );

      await screen.findByText(ON_STATUS);
      // No explanation and no full-width button above the inbox.
      expect(screen.queryByText(/Te avisamos acá/)).toBe(null);
      expect(
        screen.getByRole("button", { name: DISABLE_LABEL }).textContent,
      ).toBe("Desactivar");
      expect(container.querySelector("details")?.open).toBe(false);
      // Still named for screen readers.
      expect(
        screen.getByRole("region", {
          name: "Notificaciones en este dispositivo",
        }),
      ).toBeTruthy();
    });

    it("stops the browser when the device was removed from another one meanwhile", async () => {
      const browser = installBrowser({
        permission: "granted",
        subscribedWith: KEY,
      });
      render(<PushControl publicKey={KEY} devices={[]} />);

      await enabledButton();
      expect(calls).toEqual(["refresh", "unsubscribe"]);
      expect(browser.subscription).toBe(null);
      expect(mocks.forgetPushDeviceAction).not.toHaveBeenCalled();
      expect(screen.queryByText(ON_STATUS)).toBe(null);
    });

    it("keeps avisos on when the visit's refresh is turned away", async () => {
      const browser = installBrowser({
        permission: "granted",
        subscribedWith: KEY,
      });
      mocks.savePushDeviceAction.mockResolvedValue({
        success: false,
        message: "Hiciste demasiados intentos. Esperá un minuto.",
      });
      render(<PushControl publicKey={KEY} devices={DEVICES} />);

      await screen.findByText(ON_STATUS);
      expect(browser.subscription?.unsubscribe).not.toHaveBeenCalled();
      expect(screen.queryByText("Este dispositivo")).toBe(null);
      expect(mocks.toastError).not.toHaveBeenCalled();
    });

    it("drops a subscription made with a key this environment no longer uses", async () => {
      const browser = installBrowser({
        permission: "granted",
        subscribedWith: OLD_KEY,
      });
      savedDevices.set(ENDPOINT, 7);
      render(<PushControl publicKey={KEY} devices={[]} />);

      await enabledButton();
      expect(calls).toEqual(["unsubscribe", "forget"]);
      expect(mocks.forgetPushDeviceAction).toHaveBeenCalledWith(ENDPOINT);
      expect(browser.subscription).toBe(null);
      expect(mocks.savePushDeviceAction).not.toHaveBeenCalled();
    });

    it("drops a subscription whose permission was reset since", async () => {
      const browser = installBrowser({
        permission: "default",
        subscribedWith: KEY,
      });
      savedDevices.set(ENDPOINT, 7);
      render(<PushControl publicKey={KEY} devices={[]} />);

      await enabledButton();
      expect(calls).toEqual(["unsubscribe", "forget"]);
      expect(browser.subscription).toBe(null);
    });
  });

  describe("turning avisos off", () => {
    it("stops the browser before removing the device, then says so", async () => {
      const browser = installBrowser({
        permission: "granted",
        subscribedWith: KEY,
      });
      savedDevices.set(ENDPOINT, 7);
      render(<PushControl publicKey={KEY} devices={DEVICES} />);

      fireEvent.click(
        await screen.findByRole("button", { name: DISABLE_LABEL }),
      );

      await waitFor(() =>
        expect(mocks.toastSuccess).toHaveBeenCalledWith(DISABLED_TOAST),
      );
      expect(calls).toEqual(["refresh", "unsubscribe", "remove:7"]);
      expect(mocks.removePushDeviceAction).toHaveBeenCalledWith(7);
      expect(browser.subscription).toBe(null);
      expect(mocks.refresh).toHaveBeenCalledTimes(1);
      await enabledButton();
    });

    it("keeps the device when the browser cannot unsubscribe, and says so", async () => {
      const browser = installBrowser({
        permission: "granted",
        subscribedWith: KEY,
      });
      savedDevices.set(ENDPOINT, 7);
      browser.subscription?.unsubscribe.mockRejectedValue(new Error("nope"));
      render(<PushControl publicKey={KEY} devices={DEVICES} />);

      fireEvent.click(
        await screen.findByRole("button", { name: DISABLE_LABEL }),
      );

      await waitFor(() =>
        expect(mocks.toastError).toHaveBeenCalledWith(
          "No pudimos desactivar las notificaciones en este dispositivo. Intentá de nuevo.",
        ),
      );
      expect(mocks.removePushDeviceAction).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(screen.getByText(ON_STATUS).textContent).toBe(ON_STATUS);
    });

    it("forgets this browser by its address when the visit could not tell which device it is", async () => {
      const browser = installBrowser({
        permission: "granted",
        subscribedWith: KEY,
      });
      mocks.savePushDeviceAction.mockResolvedValue({
        success: false,
        message: "Hiciste demasiados intentos. Esperá un minuto.",
      });
      render(<PushControl publicKey={KEY} devices={DEVICES} />);

      fireEvent.click(
        await screen.findByRole("button", { name: DISABLE_LABEL }),
      );

      await waitFor(() =>
        expect(mocks.toastSuccess).toHaveBeenCalledWith(DISABLED_TOAST),
      );
      expect(calls).toEqual(["unsubscribe", "forget"]);
      expect(mocks.forgetPushDeviceAction).toHaveBeenCalledWith(ENDPOINT);
      expect(mocks.removePushDeviceAction).not.toHaveBeenCalled();
      expect(browser.subscription).toBe(null);
    });

    it("counts as done once the browser stopped, even if the server is unreachable", async () => {
      const browser = installBrowser({
        permission: "granted",
        subscribedWith: KEY,
      });
      savedDevices.set(ENDPOINT, 7);
      mocks.removePushDeviceAction.mockRejectedValue(new Error("offline"));
      render(<PushControl publicKey={KEY} devices={DEVICES} />);

      fireEvent.click(
        await screen.findByRole("button", { name: DISABLE_LABEL }),
      );

      await waitFor(() =>
        expect(mocks.toastSuccess).toHaveBeenCalledWith(DISABLED_TOAST),
      );
      expect(browser.subscription).toBe(null);
      expect(mocks.toastError).not.toHaveBeenCalled();
      await enabledButton();
    });
  });

  describe("the device list", () => {
    it("tucks the devices into a collapsible list with their count", async () => {
      installBrowser({ permission: "granted", subscribedWith: KEY });
      savedDevices.set(ENDPOINT, 7);
      render(<PushControl publicKey={KEY} devices={DEVICES} />);

      const summary = screen.getByText("Tus dispositivos (2)");
      expect(summary.tagName).toBe("SUMMARY");
      const details = summary.closest("details") as HTMLElement;
      expect(details.contains(deviceRow("Chrome en Windows"))).toBe(true);
      expect(details.contains(deviceRow("iPhone"))).toBe(true);
      expect(within(deviceRow("iPhone")).getByText(/hace 3 días/)).toBeTruthy();
      await screen.findByText(ON_STATUS);
    });

    it("leaves the list out when there are no devices", async () => {
      installBrowser();
      render(<PushControl publicKey={KEY} devices={[]} />);
      await enabledButton();
      expect(screen.queryByText(/Tus dispositivos/)).toBe(null);
    });

    it("removes another device and refreshes, leaving this browser alone", async () => {
      const browser = installBrowser({
        permission: "granted",
        subscribedWith: KEY,
      });
      savedDevices.set(ENDPOINT, 7);
      render(<PushControl publicKey={KEY} devices={DEVICES} />);
      await screen.findByText(ON_STATUS);

      fireEvent.click(
        screen.getByRole("button", {
          name: "Quitar iPhone (último uso hace 3 días)",
        }),
      );

      await waitFor(() =>
        expect(mocks.toastSuccess).toHaveBeenCalledWith(
          "Quitamos iPhone. Ya no va a recibir tus notificaciones.",
        ),
      );
      expect(mocks.removePushDeviceAction).toHaveBeenCalledWith(9);
      expect(mocks.refresh).toHaveBeenCalledTimes(1);
      expect(browser.subscription?.unsubscribe).not.toHaveBeenCalled();
    });

    it("turns avisos off here when the row removed is this device", async () => {
      const browser = installBrowser({
        permission: "granted",
        subscribedWith: KEY,
      });
      savedDevices.set(ENDPOINT, 7);
      render(<PushControl publicKey={KEY} devices={DEVICES} />);
      await screen.findByText(ON_STATUS);

      fireEvent.click(
        screen.getByRole("button", {
          name: "Quitar Chrome en Windows (último uso hoy)",
        }),
      );

      await waitFor(() =>
        expect(mocks.toastSuccess).toHaveBeenCalledWith(DISABLED_TOAST),
      );
      expect(calls).toEqual(["refresh", "unsubscribe", "remove:7"]);
      expect(browser.subscription).toBe(null);
    });

    it("says so when a device could not be removed", async () => {
      installBrowser({ permission: "granted", subscribedWith: KEY });
      savedDevices.set(ENDPOINT, 7);
      mocks.removePushDeviceAction.mockRejectedValue(new Error("offline"));
      render(<PushControl publicKey={KEY} devices={DEVICES} />);
      await screen.findByText(ON_STATUS);

      fireEvent.click(
        screen.getByRole("button", {
          name: "Quitar iPhone (último uso hace 3 días)",
        }),
      );

      await waitFor(() =>
        expect(mocks.toastError).toHaveBeenCalledWith(
          "No pudimos quitar el dispositivo. Intentá de nuevo.",
        ),
      );
      expect(mocks.refresh).not.toHaveBeenCalled();
    });
  });
});

describe("the short avisos offer", () => {
  it("renders nothing on the server", () => {
    installBrowser();
    expect(renderToString(<PushOffer publicKey={KEY} showBlocked />)).toBe("");
  });

  it("offers the button in a browser that has not been asked yet", async () => {
    installBrowser();
    render(
      <PushOffer publicKey={KEY} prompt="¿Querés enterarte al instante?" />,
    );
    expect(
      (await screen.findByRole("button", { name: ENABLE_PUSH_LABEL }))
        .textContent,
    ).toBe(ENABLE_PUSH_LABEL);
    expect(screen.getByText(/¿Querés enterarte al instante\?/)).toBeTruthy();
  });

  it("offers the button where avisos are allowed but this browser is not subscribed", async () => {
    installBrowser({ permission: "granted" });
    render(<PushOffer publicKey={KEY} />);
    expect(
      await screen.findByRole("button", { name: ENABLE_PUSH_LABEL }),
    ).toBeTruthy();
  });

  it("turns avisos on from the tap, and then goes away", async () => {
    const browser = installBrowser();
    browser.answerPrompt("granted");
    const { container } = render(<PushOffer publicKey={KEY} />);

    fireEvent.click(
      await screen.findByRole("button", { name: ENABLE_PUSH_LABEL }),
    );

    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(ENABLED_TOAST),
    );
    await waitFor(() => expect(container.innerHTML).toBe(""));
    expect(browser.requestPermission).toHaveBeenCalledTimes(1);
    // The bell does not refresh "Último uso" on every page.
    expect(calls).toEqual(["subscribe", "save"]);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("ignores a second tap while the first is still asking", async () => {
    const browser = installBrowser();
    browser.requestPermission.mockReturnValue(openUntilTheTestEnds());
    render(<PushOffer publicKey={KEY} />);
    const button = await screen.findByRole("button", {
      name: ENABLE_PUSH_LABEL,
    });

    fireEvent.click(button);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(button);

    expect(browser.requestPermission).toHaveBeenCalledTimes(1);
  });

  it("renders nothing once this browser receives avisos", async () => {
    const browser = installBrowser({
      permission: "granted",
      subscribedWith: KEY,
    });
    const { container } = render(<PushOffer publicKey={KEY} showBlocked />);
    await waitFor(() =>
      expect(browser.pushManager.getSubscription).toHaveBeenCalled(),
    );
    await settle();
    expect(container.innerHTML).toBe("");
    expect(mocks.savePushDeviceAction).not.toHaveBeenCalled();
  });

  it("goes away when the page control turns avisos on", async () => {
    const browser = installBrowser({ permission: "granted" });
    render(
      <>
        <PushControl publicKey={KEY} devices={[]} />
        <div data-testid="offer">
          <PushOffer publicKey={KEY} />
        </div>
      </>,
    );
    const offer = screen.getByTestId("offer");
    await waitFor(() =>
      expect(within(offer).queryByRole("button")).toBeTruthy(),
    );

    fireEvent.click(
      within(screen.getByRole("region")).getByRole("button", {
        name: ENABLE_PUSH_LABEL,
      }),
    );

    await waitFor(() => expect(offer.innerHTML).toBe(""));
    expect(browser.subscription).toBeTruthy();
  });

  it("keeps the subscription it makes when the page control checks meanwhile", async () => {
    const browser = installBrowser();
    browser.answerPrompt("granted");
    render(
      <>
        <PushControl publicKey={KEY} devices={[]} />
        <div data-testid="offer">
          <PushOffer publicKey={KEY} />
        </div>
      </>,
    );
    const offer = screen.getByTestId("offer");
    const button = await within(offer).findByRole("button", {
      name: ENABLE_PUSH_LABEL,
    });
    await settle();
    const registrations: Array<() => void> = [];
    browser.serviceWorker.register.mockImplementation(
      () =>
        new Promise((resolve) =>
          registrations.push(() => resolve(browser.registration)),
        ),
    );
    let finishSave = () => {};
    const save = mocks.savePushDeviceAction.getMockImplementation()!;
    mocks.savePushDeviceAction.mockImplementation(
      async (input: { refreshOnly?: boolean }) => {
        if (!input.refreshOnly) {
          await new Promise<void>((resolve) => {
            finishSave = resolve;
          });
        }
        return save(input);
      },
    );

    fireEvent.click(button);
    await settle();
    // Each control's check, set off by the granted permission, and the
    // offer's own flow, which subscribes and starts saving the device.
    expect(registrations).toHaveLength(3);
    registrations[1]();
    await settle();
    expect(calls).toEqual(["subscribe"]);
    // The page control's check then finds the subscription whose device is
    // still being saved; it would get "no device" back.
    registrations[0]();
    registrations[2]();
    await settle();
    browser.serviceWorker.register.mockImplementation(
      async () => browser.registration,
    );
    finishSave();

    await waitFor(() => expect(offer.innerHTML).toBe(""));
    expect(browser.subscription).toBeTruthy();
    expect(calls).toEqual(["subscribe", "save", "refresh"]);
    expect((await screen.findByText(ON_STATUS)).textContent).toBe(ON_STATUS);
  });

  it("ignores a tap on the page control while the offer is still asking", async () => {
    const browser = installBrowser();
    browser.requestPermission.mockReturnValue(openUntilTheTestEnds());
    render(
      <>
        <PushControl publicKey={KEY} devices={[]} />
        <div data-testid="offer">
          <PushOffer publicKey={KEY} />
        </div>
      </>,
    );
    const offer = screen.getByTestId("offer");
    fireEvent.click(
      await within(offer).findByRole("button", { name: ENABLE_PUSH_LABEL }),
    );

    fireEvent.click(
      await within(screen.getByRole("region")).findByRole("button", {
        name: ENABLE_PUSH_LABEL,
      }),
    );
    await settle();

    expect(browser.requestPermission).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("links an iPhone in a Safari tab to the steps on /my_notifications", () => {
    installBrowser({ userAgent: IPHONE, pushManager: false });
    render(<PushOffer publicKey={KEY} />);
    expect(
      screen
        .getByRole("link", { name: "Cómo activar las notificaciones" })
        .getAttribute("href"),
    ).toBe("/my_notifications");
    expect(enableButton()).toBe(null);
  });

  it("links Instagram's browser on an iPhone to the steps too", () => {
    installBrowser({ userAgent: IPHONE_INSTAGRAM, pushManager: false });
    render(<PushOffer publicKey={KEY} />);
    expect(
      screen.getByRole("link", { name: "Cómo activar las notificaciones" }),
    ).toBeTruthy();
  });

  it("says avisos are blocked in the bell, linking to how to allow them", () => {
    installBrowser({ permission: "denied" });
    render(<PushOffer publicKey={KEY} showBlocked />);
    expect(
      screen.getByText(/Notificaciones bloqueadas en este navegador/)
        .textContent,
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Cómo activarlas" })
        .getAttribute("href"),
    ).toBe("/my_notifications");
  });

  it("renders nothing for a blocked browser outside the bell", () => {
    installBrowser({ permission: "denied" });
    const { container } = render(<PushOffer publicKey={KEY} />);
    expect(container.innerHTML).toBe("");
  });

  it("says the browser cannot receive avisos only in the bell", () => {
    installBrowser({ pushManager: false });
    const { container, rerender } = render(<PushOffer publicKey={KEY} />);
    expect(container.innerHTML).toBe("");
    rerender(<PushOffer publicKey={KEY} showBlocked />);
    expect(
      screen.getByText("Este navegador no puede recibir notificaciones")
        .textContent,
    ).toBeTruthy();
  });

  it("renders nothing on an iPhone too old for avisos", () => {
    installBrowser({ userAgent: IPHONE_16_3, standalone: true });
    const { container } = render(<PushOffer publicKey={KEY} showBlocked />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when this environment has no key", async () => {
    const browser = installBrowser();
    const { container } = render(<PushOffer publicKey={null} showBlocked />);
    await settle();
    expect(container.innerHTML).toBe("");
    expect(browser.serviceWorker.register).not.toHaveBeenCalled();
  });
});

describe("forgetting this browser on sign-out", () => {
  it("stops the browser first, then forgets the device on the server", async () => {
    const browser = installBrowser({
      permission: "granted",
      subscribedWith: KEY,
    });
    savedDevices.set(ENDPOINT, 7);

    await forgetThisBrowserForPush();

    expect(calls).toEqual(["unsubscribe", "forget"]);
    expect(mocks.forgetPushDeviceAction).toHaveBeenCalledWith(ENDPOINT);
    expect(browser.subscription).toBe(null);
    expect(browser.serviceWorker.register).not.toHaveBeenCalled();
  });

  it("still forgets the device when the browser fails to unsubscribe", async () => {
    const browser = installBrowser({
      permission: "granted",
      subscribedWith: KEY,
    });
    browser.subscription?.unsubscribe.mockRejectedValue(new Error("nope"));

    await forgetThisBrowserForPush();

    expect(mocks.forgetPushDeviceAction).toHaveBeenCalledWith(ENDPOINT);
  });

  it("never holds sign-out up past its limit, even when the server does not answer", async () => {
    vi.useFakeTimers();
    installBrowser({ permission: "granted", subscribedWith: KEY });
    mocks.forgetPushDeviceAction.mockReturnValue(new Promise(() => {}));
    let done = false;
    void forgetThisBrowserForPush(1_500).then(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(1_499);
    expect(mocks.forgetPushDeviceAction).toHaveBeenCalledWith(ENDPOINT);
    expect(done).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it("does nothing on a browser with no worker registered", async () => {
    const browser = installBrowser();
    browser.serviceWorker.getRegistration.mockResolvedValue(undefined);

    await forgetThisBrowserForPush(50);

    expect(mocks.forgetPushDeviceAction).not.toHaveBeenCalled();
  });

  it("does nothing on a browser that never turned avisos on", async () => {
    installBrowser();

    await forgetThisBrowserForPush(50);

    expect(mocks.forgetPushDeviceAction).not.toHaveBeenCalled();
  });

  it("does nothing where service workers do not exist", async () => {
    installBrowser({ serviceWorker: false, pushManager: false });

    await forgetThisBrowserForPush(50);

    expect(mocks.forgetPushDeviceAction).not.toHaveBeenCalled();
  });
});

function ReleaseCheck({ userId }: { userId: number | null }) {
  useReleaseForeignPushDevice(userId);
  return null;
}

describe("letting go of a subscription saved under another account", () => {
  it("unsubscribes the browser when the server released it", async () => {
    const browser = installBrowser({
      permission: "granted",
      subscribedWith: KEY,
    });
    mocks.releaseForeignPushDeviceAction.mockResolvedValue({
      success: true,
      released: true,
    });
    const subscription = browser.subscription as FakeSubscription;

    render(<ReleaseCheck userId={1} />);

    await waitFor(() =>
      expect(subscription.unsubscribe).toHaveBeenCalledTimes(1),
    );
    expect(mocks.releaseForeignPushDeviceAction).toHaveBeenCalledWith({
      endpoint: ENDPOINT,
      auth: AUTH,
    });
  });

  it("keeps the subscription when it is this person's own", async () => {
    const browser = installBrowser({
      permission: "granted",
      subscribedWith: KEY,
    });

    render(<ReleaseCheck userId={1} />);

    await waitFor(() =>
      expect(mocks.releaseForeignPushDeviceAction).toHaveBeenCalledTimes(1),
    );
    await settle();
    expect(browser.subscription?.unsubscribe).not.toHaveBeenCalled();
  });

  it("asks once per session for each person signed in", async () => {
    installBrowser({ permission: "granted", subscribedWith: KEY });

    render(<ReleaseCheck userId={1} />);
    await waitFor(() =>
      expect(mocks.releaseForeignPushDeviceAction).toHaveBeenCalledTimes(1),
    );
    cleanup();

    render(<ReleaseCheck userId={1} />);
    await settle();
    expect(mocks.releaseForeignPushDeviceAction).toHaveBeenCalledTimes(1);
    cleanup();

    render(<ReleaseCheck userId={2} />);
    await waitFor(() =>
      expect(mocks.releaseForeignPushDeviceAction).toHaveBeenCalledTimes(2),
    );
  });

  it("still asks once per page when the browser blocks session storage", async () => {
    installBrowser({ permission: "granted", subscribedWith: KEY });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    render(<ReleaseCheck userId={1} />);

    await waitFor(() =>
      expect(mocks.releaseForeignPushDeviceAction).toHaveBeenCalledTimes(1),
    );
  });

  it("asks nothing on a browser that never turned avisos on", async () => {
    const browser = installBrowser();

    render(<ReleaseCheck userId={1} />);

    await waitFor(() =>
      expect(browser.pushManager.getSubscription).toHaveBeenCalled(),
    );
    await settle();
    expect(mocks.releaseForeignPushDeviceAction).not.toHaveBeenCalled();
  });

  it("asks nothing for a signed-out visitor", async () => {
    const browser = installBrowser({
      permission: "granted",
      subscribedWith: KEY,
    });

    render(<ReleaseCheck userId={null} />);

    await settle();
    expect(browser.serviceWorker.getRegistration).not.toHaveBeenCalled();
    expect(mocks.releaseForeignPushDeviceAction).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });
});
