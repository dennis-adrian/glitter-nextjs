import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PushSupport } from "@/app/lib/notifications/push/support";

const state = vi.hoisted(() => ({
  support: "default" as PushSupport,
  phase: "off" as "checking" | "off" | "on" | "working",
  enable: vi.fn(),
  toastSuccess: vi.fn(),
}));

// The device hook has its own tests; here it only says what the browser can
// do and whether this device already receives notifications.
vi.mock("@/app/components/notifications/use-push-device", () => ({
  usePushSupport: () => state.support,
  usePushDevice: () => ({
    phase: state.phase,
    deviceId: null,
    enable: state.enable,
    disable: vi.fn(),
  }),
}));
vi.mock("@/app/components/notifications/push-control", () => ({
  ENABLE_PUSH_LABEL: "Recibir notificaciones en este dispositivo",
}));
vi.mock("sonner", () => ({
  toast: { success: state.toastSuccess, error: vi.fn() },
}));

import HomePushBanner, {
  DISMISS_FOR_MS,
  DISMISSED_AT_KEY,
  resetDismissedForTests,
} from "@/app/components/home/home-push-banner";

const KEY = "public-key";
const enableButton = () =>
  screen.queryByRole("button", {
    name: "Recibir notificaciones en este dispositivo",
  });
const heading = () => screen.queryByText("Activá las notificaciones");

beforeEach(() => {
  state.support = "default";
  state.phase = "off";
  state.enable.mockReset();
  state.toastSuccess.mockReset();
  window.localStorage.clear();
  resetDismissedForTests();
});

afterEach(cleanup);

describe("Inicio's notifications banner", () => {
  it("offers to turn notifications on where this device can and has not", async () => {
    render(<HomePushBanner publicKey={KEY} />);
    expect(heading()).toBeTruthy();
    state.enable.mockResolvedValue({ ok: true });
    await act(async () => {
      fireEvent.click(enableButton()!);
    });
    expect(state.enable).toHaveBeenCalledTimes(1);
    expect(state.toastSuccess).toHaveBeenCalled();
  });

  it("sends an iPhone outside the installed app to /instalar", () => {
    state.support = "ios-needs-install";
    render(<HomePushBanner publicKey={KEY} />);
    expect(heading()).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Ver cómo" }).getAttribute("href"),
    ).toBe("/instalar");
    expect(enableButton()).toBe(null);
  });

  it.each([
    ["already on", "default", "on"],
    ["still checking", "default", "checking"],
    ["blocked", "denied", "off"],
    ["not able to", "unsupported", "off"],
    ["on an old iPhone", "ios-outdated", "off"],
    ["before the browser is asked", "unknown", "off"],
  ] as const)("shows nothing %s", (_, support, phase) => {
    state.support = support;
    state.phase = phase;
    render(<HomePushBanner publicKey={KEY} />);
    expect(heading()).toBe(null);
  });

  it("shows nothing when notifications are not open to this person", () => {
    render(<HomePushBanner publicKey={null} />);
    expect(heading()).toBe(null);
  });

  it("hides for 30 days after «Ahora no», on this device", () => {
    const { unmount } = render(<HomePushBanner publicKey={KEY} />);
    fireEvent.click(screen.getByRole("button", { name: "Ahora no" }));
    expect(heading()).toBe(null);
    unmount();

    // A later visit inside the 30 days.
    render(<HomePushBanner publicKey={KEY} />);
    expect(heading()).toBe(null);
    cleanup();

    // Past them, it comes back (on a later page load).
    resetDismissedForTests();
    window.localStorage.setItem(
      DISMISSED_AT_KEY,
      String(Date.now() - DISMISS_FOR_MS - 1000),
    );
    render(<HomePushBanner publicKey={KEY} />);
    expect(heading()).toBeTruthy();
  });

  it("shows anyway when storage is blocked", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });
    render(<HomePushBanner publicKey={KEY} />);
    expect(heading()).toBeTruthy();
    getItem.mockRestore();
  });
});
