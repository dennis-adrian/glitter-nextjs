// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type DraftFields,
  retryDelayMs,
  type SaveDraft,
  useDraftAutosave,
} from "@/app/components/comunicados/admin/composer/use-autosave";
import type { SaveComunicadoDraftActionResult } from "@/app/lib/comunicados/actions";
import type { ComunicadoDraftInput } from "@/app/lib/comunicados/definitions";

const DEBOUNCE = 1_500;

function fields(overrides: Partial<DraftFields> = {}): DraftFields {
  return {
    title: "",
    doc: [],
    actionLabel: null,
    actionPath: null,
    sendEmail: true,
    sendPush: false,
    audience: { festivals: [], lists: [], people: [] },
    essential: false,
    essentialReason: null,
    ...overrides,
  };
}

/** A save the test answers by hand, one request at a time. */
function manualSave() {
  const calls: {
    input: ComunicadoDraftInput;
    resolve: (result: SaveComunicadoDraftActionResult) => void;
  }[] = [];
  const save = vi.fn<SaveDraft>(
    (input) =>
      new Promise((resolve) => {
        calls.push({ input, resolve });
      }),
  );
  return { save, calls };
}

function saved(version: number, contentError: string | null = null) {
  return {
    success: true as const,
    version,
    savedAt: new Date().toISOString(),
    contentError,
  };
}

function setup(save: SaveDraft, initial = fields()) {
  return renderHook(
    ({ value }: { value: DraftFields }) =>
      useDraftAutosave({
        comunicadoId: 7,
        initialVersion: 3,
        fields: value,
        save,
        debounceMs: DEBOUNCE,
      }),
    { initialProps: { value: initial } },
  );
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function answer(
  call: { resolve: (result: SaveComunicadoDraftActionResult) => void },
  result: SaveComunicadoDraftActionResult,
) {
  await act(async () => {
    call.resolve(result);
    await Promise.resolve();
  });
}

describe("useDraftAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("saves nothing on open, and waits for the debounce after a change", async () => {
    const { save, calls } = manualSave();
    const { result, rerender } = setup(save);
    expect(result.current.status.kind).toBe("saved");

    rerender({ value: fields({ title: "Ho" }) });
    rerender({ value: fields({ title: "Hola" }) });
    expect(result.current.status.kind).toBe("saving");
    expect(result.current.unsaved).toBe(true);

    await advance(DEBOUNCE - 1);
    expect(save).not.toHaveBeenCalled();
    await advance(1);
    expect(save).toHaveBeenCalledTimes(1);
    // Only the last fields go, with the version the composer opened with.
    expect(calls[0]!.input).toMatchObject({
      comunicadoId: 7,
      expectedVersion: 3,
      title: "Hola",
    });

    await answer(calls[0]!, saved(4));
    expect(result.current.status.kind).toBe("saved");
    expect(result.current.unsaved).toBe(false);
  });

  it("keeps one save in flight, queues the latest fields and sends the adopted version", async () => {
    const { save, calls } = manualSave();
    const { result, rerender } = setup(save);

    rerender({ value: fields({ title: "Uno" }) });
    await advance(DEBOUNCE);
    expect(save).toHaveBeenCalledTimes(1);

    // Two more changes while the first save is unanswered.
    rerender({ value: fields({ title: "Dos" }) });
    await advance(DEBOUNCE);
    rerender({ value: fields({ title: "Tres" }) });
    await advance(DEBOUNCE);
    expect(save).toHaveBeenCalledTimes(1);

    await answer(calls[0]!, saved(10));
    // The queued fields go at once, carrying the version just returned.
    expect(save).toHaveBeenCalledTimes(2);
    expect(calls[1]!.input).toMatchObject({
      expectedVersion: 10,
      title: "Tres",
    });

    await answer(calls[1]!, saved(11));
    expect(result.current.status.kind).toBe("saved");

    rerender({ value: fields({ title: "Cuatro" }) });
    await advance(DEBOUNCE);
    expect(calls[2]!.input.expectedVersion).toBe(11);
  });

  it("stops for good when another tab saved first", async () => {
    const { save, calls } = manualSave();
    const { result, rerender } = setup(save);

    rerender({ value: fields({ title: "Mío" }) });
    await advance(DEBOUNCE);
    await answer(calls[0]!, {
      success: false,
      code: "STALE",
      message:
        "Este borrador cambió en otra pestaña. Recargá para ver la última versión.",
    });

    expect(result.current.status).toEqual({
      kind: "blocked",
      code: "STALE",
      message:
        "Este borrador cambió en otra pestaña. Recargá para ver la última versión.",
    });
    // Nothing to warn about on leaving: reloading is the way out.
    expect(result.current.unsaved).toBe(false);

    rerender({ value: fields({ title: "Mío otra vez" }) });
    await advance(DEBOUNCE * 10);
    expect(save).toHaveBeenCalledTimes(1);

    let flushed: Awaited<
      ReturnType<typeof result.current.controller.flush>
    > | null = null;
    await act(async () => {
      flushed = await result.current.controller.flush();
    });
    expect(flushed).toEqual({
      ok: false,
      message:
        "Este borrador cambió en otra pestaña. Recargá para ver la última versión.",
    });
  });

  it.each(["NOT_DRAFT", "NOT_FOUND"] as const)(
    "stops when the server answers %s",
    async (code) => {
      const { save, calls } = manualSave();
      const { result, rerender } = setup(save);
      rerender({ value: fields({ title: "x" }) });
      await advance(DEBOUNCE);
      await answer(calls[0]!, { success: false, code, message: "No." });
      expect(result.current.status.kind).toBe("blocked");
      rerender({ value: fields({ title: "y" }) });
      await advance(DEBOUNCE * 2);
      expect(save).toHaveBeenCalledTimes(1);
    },
  );

  it("surfaces a refused text while the other fields count as saved", async () => {
    const { save, calls } = manualSave();
    const { result, rerender } = setup(save);

    rerender({ value: fields({ title: "Título", doc: [{ type: "table" }] }) });
    await advance(DEBOUNCE);
    await answer(
      calls[0]!,
      saved(4, "El texto tiene un bloque que no se puede enviar."),
    );

    expect(result.current.status.kind).toBe("saved");
    expect(result.current.contentError).toBe(
      "El texto tiene un bloque que no se puede enviar.",
    );
    // The text itself is not stored: leaving still warns.
    expect(result.current.unsaved).toBe(true);

    rerender({ value: fields({ title: "Título", doc: [] }) });
    await advance(DEBOUNCE);
    await answer(calls[1]!, saved(5));
    expect(result.current.contentError).toBeNull();
    expect(result.current.unsaved).toBe(false);
  });

  it("retries a failed save with a growing pause", async () => {
    const { save, calls } = manualSave();
    const { result, rerender } = setup(save);

    rerender({ value: fields({ title: "x" }) });
    await advance(DEBOUNCE);
    await answer(calls[0]!, {
      success: false,
      code: "FAILED",
      message: "No se pudo guardar el borrador.",
    });
    expect(result.current.status.kind).toBe("retrying");

    await advance(retryDelayMs(1) - 1);
    expect(save).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(save).toHaveBeenCalledTimes(2);
    expect(calls[1]!.input.expectedVersion).toBe(3);

    await answer(calls[1]!, {
      success: false,
      code: "FAILED",
      message: "No se pudo guardar el borrador.",
    });
    await advance(retryDelayMs(2) - 1);
    expect(save).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(save).toHaveBeenCalledTimes(3);

    await answer(calls[2]!, saved(4));
    expect(result.current.status.kind).toBe("saved");
  });

  it("treats a thrown request as a failure to retry", async () => {
    const save = vi
      .fn<SaveDraft>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(saved(4));
    const { result, rerender } = setup(save);
    rerender({ value: fields({ title: "x" }) });
    await advance(DEBOUNCE);
    expect(result.current.status.kind).toBe("retrying");
    await advance(retryDelayMs(1));
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.status.kind).toBe("saved");
  });

  it("flushes without waiting for the debounce", async () => {
    const save = vi.fn<SaveDraft>().mockResolvedValue(saved(4));
    const { result, rerender } = setup(save);
    rerender({ value: fields({ title: "Ya" }) });

    let flushed: unknown = null;
    await act(async () => {
      flushed = await result.current.controller.flush();
    });
    expect(flushed).toEqual({ ok: true });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0]).toMatchObject({ title: "Ya" });

    // The debounce that was pending does not save the same fields again.
    await advance(DEBOUNCE * 2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("refuses a flush while the text is refused", async () => {
    const save = vi
      .fn<SaveDraft>()
      .mockResolvedValue(saved(4, "El texto es demasiado largo."));
    const { result, rerender } = setup(save);
    rerender({ value: fields({ title: "x" }) });
    let flushed: unknown = null;
    await act(async () => {
      flushed = await result.current.controller.flush();
    });
    expect(flushed).toEqual({
      ok: false,
      message: "El texto es demasiado largo.",
    });
  });

  it("pauses after the save in flight, so a discard races no save", async () => {
    const { save, calls } = manualSave();
    const { result, rerender } = setup(save);
    rerender({ value: fields({ title: "Uno" }) });
    await advance(DEBOUNCE);
    rerender({ value: fields({ title: "Dos" }) });

    let paused = false;
    let resume: () => void = () => {};
    act(() => {
      void result.current.controller.pause().then((fn) => {
        paused = true;
        resume = fn;
      });
    });
    expect(paused).toBe(false);
    await answer(calls[0]!, saved(4));
    await act(async () => {
      await Promise.resolve();
    });
    expect(paused).toBe(true);

    // "Dos" waits while paused…
    await advance(DEBOUNCE * 2);
    expect(save).toHaveBeenCalledTimes(1);

    // …and goes once resumed (the discard failed).
    act(() => resume());
    expect(save).toHaveBeenCalledTimes(2);
    expect(calls[1]!.input).toMatchObject({
      expectedVersion: 4,
      title: "Dos",
    });
  });
});
