// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import StaleDeploymentListener from "@/app/components/providers/stale-deployment-listener";
import { STALE_DEPLOYMENT_MESSAGE } from "@/app/lib/errors/action-error";
import { toast } from "sonner";

/** jsdom has no PromiseRejectionEvent, and the listener only reads `reason`. */
function reject(reason: unknown) {
  window.dispatchEvent(
    Object.assign(new Event("unhandledrejection"), { reason }),
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StaleDeploymentListener", () => {
  it("tells a stale tab to reload when nobody caught the action", () => {
    render(<StaleDeploymentListener />);
    reject(new UnrecognizedActionError("Server Action not found"));

    expect(toast.error).toHaveBeenCalledWith(
      STALE_DEPLOYMENT_MESSAGE,
      expect.objectContaining({ id: "stale-deployment" }),
    );
  });

  it("stays out of every other unhandled rejection", () => {
    render(<StaleDeploymentListener />);
    reject(new Error("network"));
    reject(undefined);

    expect(toast.error).not.toHaveBeenCalled();
  });

  it("stops listening once unmounted", () => {
    const { unmount } = render(<StaleDeploymentListener />);
    unmount();
    reject(new UnrecognizedActionError("Server Action not found"));

    expect(toast.error).not.toHaveBeenCalled();
  });
});
