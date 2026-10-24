import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
// Component tests mock next/navigation for useRouter alone; the helper is
// called from those components, so it must not reach into that module.
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import {
  actionErrorMessage,
  isStaleDeploymentError,
  STALE_DEPLOYMENT_MESSAGE,
  toastActionError,
  toastStaleDeployment,
} from "@/app/lib/errors/action-error";
import { toast } from "sonner";

/** What Next's client router throws when the response carries the marker. */
const unrecognized = () =>
  new UnrecognizedActionError(
    'Server Action "7f3a" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action',
  );

afterEach(() => vi.clearAllMocks());

describe("isStaleDeploymentError", () => {
  it("recognizes the error Next throws for an action the server lacks", () => {
    expect(isStaleDeploymentError(unrecognized())).toBe(true);
  });

  it("recognizes it by name, whichever copy of the class threw it", () => {
    const copy = Object.assign(new Error("whatever"), {
      name: "UnrecognizedActionError",
    });
    expect(isStaleDeploymentError(copy)).toBe(true);
  });

  /** The marker header dropped on the way back: Next throws the body instead. */
  it("recognizes the bare 409 and 400 response bodies", () => {
    expect(
      isStaleDeploymentError(new Error("Server Action unavailable.")),
    ).toBe(true);
    expect(
      isStaleDeploymentError(new Error("Invalid Server Action request.")),
    ).toBe(true);
  });

  it("leaves every other failure alone", () => {
    expect(isStaleDeploymentError(new Error("network"))).toBe(false);
    expect(isStaleDeploymentError(new Error("No hay stock suficiente."))).toBe(
      false,
    );
    expect(
      isStaleDeploymentError(
        new Error("An unexpected response was received from the server."),
      ),
    ).toBe(false);
    expect(isStaleDeploymentError(new TypeError("Failed to fetch"))).toBe(
      false,
    );
  });

  it("does not trust things that only look like errors", () => {
    expect(isStaleDeploymentError("Server Action unavailable.")).toBe(false);
    expect(isStaleDeploymentError({ name: "UnrecognizedActionError" })).toBe(
      false,
    );
    expect(isStaleDeploymentError(null)).toBe(false);
    expect(isStaleDeploymentError(undefined)).toBe(false);
  });
});

describe("actionErrorMessage", () => {
  it("swaps in the reload message for a stale tab", () => {
    expect(actionErrorMessage(unrecognized(), "No se pudo guardar.")).toBe(
      STALE_DEPLOYMENT_MESSAGE,
    );
  });

  it("keeps the caller's message otherwise", () => {
    expect(actionErrorMessage(new Error("boom"), "No se pudo guardar.")).toBe(
      "No se pudo guardar.",
    );
  });
});

describe("toastActionError", () => {
  it("shows the reload notice instead of the caller's message", () => {
    toastActionError(unrecognized(), "No se pudo guardar.", {
      description: "detalle",
    });

    expect(toast.error).toHaveBeenCalledTimes(1);
    const [message, options] = vi.mocked(toast.error).mock.calls[0];
    expect(message).toBe(
      "Hay una nueva versión de la app. Recargá la página para continuar.",
    );
    expect(options).toMatchObject({
      id: "stale-deployment",
      duration: Infinity,
      action: { label: "Recargar" },
    });
    // The caller's options describe the failure it expected, not this one.
    expect(options).not.toHaveProperty("description");
  });

  it("keeps the caller's position so the notice lands where it looks", () => {
    toastActionError(unrecognized(), "No pudimos verificar la entrada.", {
      position: "top-right",
    });

    expect(vi.mocked(toast.error).mock.calls[0][1]).toMatchObject({
      position: "top-right",
    });
  });

  it("passes any other failure through exactly as it was called", () => {
    toastActionError(new Error("network"), "No se pudo guardar.");
    toastActionError(new Error("network"), "No se pudo enviar.", {
      position: "top-right",
    });

    expect(vi.mocked(toast.error).mock.calls).toEqual([
      ["No se pudo guardar."],
      ["No se pudo enviar.", { position: "top-right" }],
    ]);
  });
});

describe("toastStaleDeployment", () => {
  it("reuses one toast id so repeated failures do not stack", () => {
    toastStaleDeployment();
    toastStaleDeployment();

    const ids = vi
      .mocked(toast.error)
      .mock.calls.map(([, options]) => options?.id);
    expect(ids).toEqual(["stale-deployment", "stale-deployment"]);
  });
});
