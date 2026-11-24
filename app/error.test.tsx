// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { afterEach, describe, expect, it, vi } from "vitest";

import RootError from "@/app/error";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RootError", () => {
  it("asks a stale tab to reload, since retrying renders the old build", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <RootError
        error={new UnrecognizedActionError("Server Action not found")}
        retry={vi.fn()}
      />,
    );

    expect(screen.getByText("Hay una nueva versión de la app")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Recargar página" }),
    ).toBeTruthy();
    expect(screen.queryByText("Intentar nuevamente")).toBeNull();
  });

  it("keeps the usual retry for any other failure", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    render(<RootError error={new Error("boom")} retry={retry} />);

    expect(screen.getByText("¡Algo salió mal!")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Intentar nuevamente" });
    // retry() fetches the page again; reset() would replay the failure.
    button.click();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Hay una nueva versión de la app")).toBeNull();
  });
});
