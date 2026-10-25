// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type DraftFields,
  retryDelayMs,
  type SaveDraft,
  useDraftAutosave,
} from "@/app/components/comunicados/admin/composer/use-autosave";
import type { SaveComunicadoDraftActionResult } from "@/app/lib/comunicados/actions";
import {
  COMUNICADO_DOC_MAX_BYTES,
  type ComunicadoDraftInput,
} from "@/app/lib/comunicados/definitions";

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

const FAILED = {
  success: false as const,
  code: "FAILED" as const,
  message: "No se pudo guardar el borrador.",
};

const STALE_MESSAGE =
  "Este borrador cambió en otra pestaña. Recargá para ver la última versión.";
const STALE = {
  success: false as const,
  code: "STALE" as const,
  message: STALE_MESSAGE,
};

function setup(save: SaveDraft, initial = fields(), onLeave?: () => void) {
  return renderHook(
    ({ value }: { value: DraftFields }) =>
      useDraftAutosave({
        comunicadoId: 7,
        initialVersion: 3,
        fields: value,
        save,
        debounceMs: DEBOUNCE,
        onLeave,
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

  it("sends a key per save, and the same key when it retries the same save", async () => {
    const { save, calls } = manualSave();
    const { rerender } = setup(save);

    rerender({ value: fields({ title: "Uno" }) });
    await advance(DEBOUNCE);
    const first = calls[0]!.input.saveKey;
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    await answer(calls[0]!, FAILED);
    await advance(retryDelayMs(1));
    // The answer was lost: the retry is the same request.
    expect(calls[1]!.input).toMatchObject({
      saveKey: first,
      expectedVersion: 3,
      title: "Uno",
    });

    await answer(calls[1]!, saved(4));
    rerender({ value: fields({ title: "Dos" }) });
    await advance(DEBOUNCE);
    expect(calls[2]!.input.saveKey).not.toBe(first);
  });

  it("asks about a save whose answer was lost before taking a stale answer for another tab's", async () => {
    const { save, calls } = manualSave();
    const { result, rerender } = setup(save);

    rerender({ value: fields({ title: "Uno" }) });
    await advance(DEBOUNCE);
    // Stored, but its answer never came back…
    await answer(calls[0]!, FAILED);
    // …and the admin kept typing before the retry.
    rerender({ value: fields({ title: "Uno dos" }) });
    await advance(DEBOUNCE);
    expect(calls[1]!.input).toMatchObject({
      title: "Uno dos",
      expectedVersion: 3,
    });
    expect(calls[1]!.input.saveKey).not.toBe(calls[0]!.input.saveKey);

    // Version 4 is that lost save: asked again by its key, the server says so.
    await answer(calls[1]!, STALE);
    expect(result.current.status.kind).toBe("saving");
    expect(calls[2]!.input).toMatchObject({
      saveKey: calls[0]!.input.saveKey,
      expectedVersion: 3,
      title: "Uno",
    });
    await answer(calls[2]!, saved(4));

    // Then the latest fields go at the version it wrote.
    expect(calls[3]!.input).toMatchObject({
      expectedVersion: 4,
      title: "Uno dos",
    });
    await answer(calls[3]!, saved(5));
    expect(result.current.status.kind).toBe("saved");
    expect(save).toHaveBeenCalledTimes(4);
  });

  it("stops when the save it asks about was not stored either", async () => {
    const { save, calls } = manualSave();
    const { result, rerender } = setup(save);

    rerender({ value: fields({ title: "Uno" }) });
    await advance(DEBOUNCE);
    await answer(calls[0]!, FAILED);
    rerender({ value: fields({ title: "Uno dos" }) });
    await advance(DEBOUNCE);
    await answer(calls[1]!, STALE);
    await answer(calls[2]!, STALE);

    expect(result.current.status).toEqual({
      kind: "blocked",
      code: "STALE",
      message: STALE_MESSAGE,
    });
    await advance(retryDelayMs(5) * 2);
    expect(save).toHaveBeenCalledTimes(3);
  });

  it("asks about each unanswered save, the oldest first, until one is the stored one", async () => {
    const { save, calls } = manualSave();
    const { result, rerender } = setup(save);

    rerender({ value: fields({ title: "Uno" }) });
    await advance(DEBOUNCE);
    await answer(calls[0]!, FAILED);
    rerender({ value: fields({ title: "Dos" }) });
    await advance(DEBOUNCE);
    await answer(calls[1]!, FAILED);
    rerender({ value: fields({ title: "Tres" }) });

    // A test send flushes: the stale answer is not the end of it.
    let flushed: unknown = null;
    let done = false;
    act(() => {
      void result.current.controller.flush().then((value) => {
        flushed = value;
        done = true;
      });
    });
    expect(calls[2]!.input).toMatchObject({ title: "Tres" });
    await answer(calls[2]!, STALE);
    expect(calls[3]!.input).toMatchObject({
      title: "Uno",
      saveKey: calls[0]!.input.saveKey,
    });
    await answer(calls[3]!, STALE);
    expect(calls[4]!.input).toMatchObject({
      title: "Dos",
      saveKey: calls[1]!.input.saveKey,
      expectedVersion: 3,
    });
    await answer(calls[4]!, saved(4));
    expect(calls[5]!.input).toMatchObject({
      title: "Tres",
      expectedVersion: 4,
    });
    expect(done).toBe(false);
    await answer(calls[5]!, saved(5));
    await act(async () => {
      await Promise.resolve();
    });
    expect(done).toBe(true);
    expect(flushed).toEqual({ ok: true });
    expect(result.current.status.kind).toBe("saved");
  });

  it("keeps a bounded number of unanswered saves to ask about", async () => {
    const { save, calls } = manualSave();
    const { result, rerender } = setup(save);

    // Offline while typing: every pause sends, and every send fails.
    for (let index = 0; index < 8; index += 1) {
      rerender({ value: fields({ title: `Versión ${index}` }) });
      await advance(DEBOUNCE);
      await answer(calls[index]!, FAILED);
    }
    rerender({ value: fields({ title: "Al volver" }) });
    await advance(DEBOUNCE);
    await answer(calls[8]!, STALE);
    // Another tab did save: five questions, the oldest first, then it stops.
    for (let index = 9; index < 14; index += 1) {
      expect(calls[index]!.input.title).toBe(`Versión ${index - 9}`);
      await answer(calls[index]!, STALE);
    }
    expect(save).toHaveBeenCalledTimes(14);
    expect(result.current.status.kind).toBe("blocked");
  });

  it("ignores a refusal of fields already replaced, and saves the newer ones", async () => {
    const { save, calls } = manualSave();
    const { result, rerender } = setup(save);

    rerender({ value: fields({ title: "Uno" }) });
    await advance(DEBOUNCE);
    rerender({ value: fields({ title: "Uno dos" }) });
    await advance(DEBOUNCE);
    await answer(calls[0]!, {
      success: false,
      code: "INVALID",
      message: "El título es demasiado largo.",
    });

    // Not about what is on screen: no error stays, and the newer fields go.
    expect(result.current.status.kind).toBe("saving");
    expect(save).toHaveBeenCalledTimes(2);
    expect(calls[1]!.input).toMatchObject({
      title: "Uno dos",
      expectedVersion: 3,
    });
    await answer(calls[1]!, saved(4));
    expect(result.current.status.kind).toBe("saved");
  });

  it("keeps a refusal of what is still on screen until the next change", async () => {
    const { save, calls } = manualSave();
    const { result, rerender } = setup(save);

    rerender({ value: fields({ title: "Uno" }) });
    await advance(DEBOUNCE);
    await answer(calls[0]!, {
      success: false,
      code: "INVALID",
      message: "El título es demasiado largo.",
    });
    expect(result.current.status).toEqual({
      kind: "invalid",
      message: "El título es demasiado largo.",
    });
    await advance(DEBOUNCE * 4);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("drops the retry when the fields go back to what is stored", async () => {
    const { save, calls } = manualSave();
    const { result, rerender } = setup(save, fields({ title: "Guardado" }));

    rerender({ value: fields({ title: "Otro" }) });
    await advance(DEBOUNCE);
    await answer(calls[0]!, FAILED);
    expect(result.current.status.kind).toBe("retrying");

    rerender({ value: fields({ title: "Guardado" }) });
    expect(result.current.status.kind).toBe("saved");
    expect(result.current.unsaved).toBe(false);
    await advance(retryDelayMs(5) * 2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("drops the retry when the fields went back while the failed save was out", async () => {
    const { save, calls } = manualSave();
    const { result, rerender } = setup(save, fields({ title: "Guardado" }));

    rerender({ value: fields({ title: "Otro" }) });
    await advance(DEBOUNCE);
    rerender({ value: fields({ title: "Guardado" }) });
    await answer(calls[0]!, FAILED);

    expect(result.current.status.kind).toBe("saved");
    await advance(retryDelayMs(5) * 2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("stops, asking for a reload, when a new release replaced the action", async () => {
    const save = vi
      .fn<SaveDraft>()
      .mockRejectedValue(
        new UnrecognizedActionError('Server Action "abc" was not found'),
      );
    const { result, rerender } = setup(save);
    rerender({ value: fields({ title: "x" }) });
    await advance(DEBOUNCE);

    expect(result.current.status).toEqual({
      kind: "blocked",
      code: "OUTDATED",
      message:
        "Se publicó una nueva versión de Glitter. Recargá la página para seguir editando.",
    });
    rerender({ value: fields({ title: "y" }) });
    await advance(retryDelayMs(5) * 2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("keeps a text far over the limit out of the request, and saves the rest", async () => {
    const save = vi.fn<SaveDraft>().mockResolvedValue(saved(4));
    const { result, rerender } = setup(save);
    const huge = [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "a".repeat(COMUNICADO_DOC_MAX_BYTES * 2) },
        ],
      },
    ];
    rerender({ value: fields({ title: "Largo", doc: huge }) });
    await advance(DEBOUNCE);

    expect(save).toHaveBeenCalledTimes(1);
    const input = save.mock.calls[0]![0];
    expect(input).toMatchObject({ title: "Largo", expectedVersion: 3 });
    expect("doc" in input).toBe(false);
    expect(result.current.status.kind).toBe("saved");
    expect(result.current.contentError).toBe(
      "El comunicado es demasiado largo. Acortá el texto.",
    );
    // The stored text is the old one: leaving warns, a test send waits.
    expect(result.current.unsaved).toBe(true);
    let flushed: unknown = null;
    await act(async () => {
      flushed = await result.current.controller.flush();
    });
    expect(flushed).toEqual({
      ok: false,
      message: "El comunicado es demasiado largo. Acortá el texto.",
    });

    // Short enough again, it goes, and the server has the last word.
    rerender({ value: fields({ title: "Largo", doc: [] }) });
    await advance(DEBOUNCE);
    expect(save.mock.calls[1]![0]).toMatchObject({ doc: [] });
    expect(result.current.contentError).toBeNull();
  });

  it("calls onLeave on unmount once a save was stored, after saving what is on screen", async () => {
    const { save, calls } = manualSave();
    const onLeave = vi.fn();
    const { rerender, unmount } = setup(save, fields(), onLeave);

    rerender({ value: fields({ title: "Uno" }) });
    await advance(DEBOUNCE);
    await answer(calls[0]!, saved(4));
    rerender({ value: fields({ title: "Uno dos" }) });

    unmount();
    // What was typed last goes at once, and only then is the page left.
    await advance(0);
    expect(calls[1]!.input).toMatchObject({ title: "Uno dos" });
    expect(onLeave).not.toHaveBeenCalled();
    await answer(calls[1]!, saved(5));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("does not call onLeave when nothing was stored", async () => {
    const save = vi.fn<SaveDraft>();
    const onLeave = vi.fn();
    const { unmount } = setup(save, fields(), onLeave);
    unmount();
    await advance(DEBOUNCE * 2);
    expect(save).not.toHaveBeenCalled();
    expect(onLeave).not.toHaveBeenCalled();
  });
});
