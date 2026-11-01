// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PreviewPanel, {
  type PreviewInput,
} from "@/app/components/comunicados/admin/composer/preview-panel";
import { COMUNICADO_DOC_MAX_BYTES } from "@/app/lib/comunicados/definitions";

const mocks = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("@/app/lib/comunicados/preview-actions", () => ({
  renderComunicadoPreviewAction: mocks.render,
}));

function input(overrides: Partial<PreviewInput> = {}): PreviewInput {
  return {
    title: "Cambio de horario",
    doc: [],
    actionLabel: null,
    actionPath: null,
    essentialFestivalName: null,
    ...overrides,
  };
}

describe("PreviewPanel", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mocks.render.mockReset();
  });

  it("offers to try again when the preview could not be rendered", async () => {
    mocks.render
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        success: false,
        message: "Este bloque no se puede usar en un comunicado: Tabla.",
      });
    render(<PreviewPanel input={input()} sendPush={false} />);

    await screen.findByText("No se pudo generar la vista previa.");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(2));

    // What the text itself breaks is not fixed by asking again.
    await screen.findByText(
      "Este bloque no se puede usar en un comunicado: Tabla.",
    );
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
  });

  it("sends no text far over the limit, and says to shorten it", async () => {
    const huge = [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "a".repeat(COMUNICADO_DOC_MAX_BYTES * 2) },
        ],
      },
    ];
    render(<PreviewPanel input={input({ doc: huge })} sendPush={false} />);

    expect(
      screen.getByText("El comunicado es demasiado largo. Acortá el texto."),
    ).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mocks.render).not.toHaveBeenCalled();
  });
});
