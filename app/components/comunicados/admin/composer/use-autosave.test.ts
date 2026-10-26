// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type DraftAutosave,
  type DraftFields,
  type FlushResult,
  newSaveKey,
  OUTDATED_MESSAGE,
  retryDelayMs,
  type SaveDraft,
  useDraftAutosave,
} from "@/app/components/comunicados/admin/composer/use-autosave";
import type { SaveComunicadoDraftActionResult } from "@/app/lib/comunicados/actions";
import {
  COMUNICADO_DOC_MAX_BYTES,
  type ComunicadoDraftInput,
  ComunicadoDraftSchema,
} from "@/app/lib/comunicados/definitions";

const DEBOUNCE = 1_500;
const COMUNICADO_ID = 7;
/** The version the composer opens with. */
const OPENED = 3;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const REFUSALS = {
  NOT_FOUND: "Este borrador ya no existe.",
  NOT_DRAFT: "Este comunicado ya no es un borrador.",
  STALE:
    "Este borrador cambió en otra pestaña. Recargá para ver la última versión.",
} as const;
const REFUSED_TEXT = "Este bloque no se puede usar en un comunicado: tabla.";
const FAILED: SaveComunicadoDraftActionResult = {
  success: false,
  code: "FAILED",
  message: "No se pudo guardar el borrador.",
};
const FLUSH_FAILED: FlushResult = {
  ok: false,
  message: "No se pudo guardar el borrador. Probá de nuevo en unos segundos.",
};

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

function paragraph(text: string) {
  return {
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}

async function settle() {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

type Request = {
  input: ComunicadoDraftInput;
  /** What the server did with it, when it reached the server. */
  result: SaveComunicadoDraftActionResult | null;
  settled: boolean;
  /** It reaches the server, and the answer comes back. */
  answer(): Promise<void>;
  /** It reaches the server, and the answer is lost on the way back. */
  lose(): Promise<void>;
  /** The server fails before the database: nothing is stored. */
  fail(): Promise<void>;
  /** The connection drops, before the server or after it stored. */
  drop(options?: { stored: boolean }): Promise<void>;
};

/**
 * The server as `saveComunicadoDraft` has it, behind the action's parse: a
 * compare-and-set on `version` that stores the key, and the replay of a
 * request whose key is stored at the version after the one it expected. A
 * table in the text is refused, and the stored text kept. Each request waits
 * for the test to say how it goes.
 */
function fakeServer(stored: DraftFields) {
  const row = {
    status: "draft" as "draft" | "sent" | "gone",
    version: OPENED,
    autosaveKey: null as string | null,
    fields: stored,
  };
  const requests: Request[] = [];

  function apply(input: ComunicadoDraftInput): SaveComunicadoDraftActionResult {
    const parsed = ComunicadoDraftSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        code: "INVALID",
        message: parsed.error.issues[0]?.message ?? "Revisá los datos.",
      };
    }
    const { comunicadoId, expectedVersion, saveKey, doc, ...rest } =
      parsed.data;
    expect(comunicadoId).toBe(COMUNICADO_ID);
    const refused =
      doc?.some((block) => (block as { type?: string }).type === "table") ??
      false;
    const ok = (replayed: boolean): SaveComunicadoDraftActionResult => ({
      success: true,
      version: row.version,
      savedAt: "2026-10-26T12:00:00.000Z",
      contentError: refused ? REFUSED_TEXT : null,
      replayed,
    });
    if (row.status === "draft" && row.version === expectedVersion) {
      row.fields = {
        ...row.fields,
        ...rest,
        ...(doc !== undefined && !refused ? { doc } : {}),
      };
      row.autosaveKey = saveKey;
      row.version += 1;
      return ok(false);
    }
    if (
      row.status === "draft" &&
      row.autosaveKey === saveKey &&
      row.version === expectedVersion + 1
    ) {
      return ok(true);
    }
    const code =
      row.status === "gone"
        ? "NOT_FOUND"
        : row.status === "draft"
          ? "STALE"
          : "NOT_DRAFT";
    return { success: false, code, message: REFUSALS[code] };
  }

  const save = vi.fn<SaveDraft>(
    (input) =>
      new Promise((resolve, reject) => {
        const respond = async (go: () => void) => {
          expect(request.settled).toBe(false);
          request.settled = true;
          await act(async () => {
            go();
            await settle();
          });
        };
        const request: Request = {
          input,
          result: null,
          settled: false,
          answer: () =>
            respond(() => {
              request.result = apply(input);
              resolve(request.result);
            }),
          lose: () =>
            respond(() => {
              request.result = apply(input);
              resolve(FAILED);
            }),
          fail: () => respond(() => resolve(FAILED)),
          drop: ({ stored } = { stored: false }) =>
            respond(() => {
              if (stored) request.result = apply(input);
              reject(new TypeError("Failed to fetch"));
            }),
        };
        requests.push(request);
      }),
  );

  return {
    row,
    requests,
    save,
    /** Another tab saves: a new version, under its own key. */
    otherTab(patch: Partial<DraftFields>) {
      row.fields = { ...row.fields, ...patch };
      row.version += 1;
      row.autosaveKey = "00000000-0000-4000-8000-000000000000";
    },
    /** Answers every request, those its answers send included. */
    async answerAll() {
      for (let round = 0; round < 50; round += 1) {
        const next = requests.find((request) => !request.settled);
        if (!next) return;
        await next.answer();
      }
      throw new Error("the autosave never stopped sending");
    },
  };
}

type Server = ReturnType<typeof fakeServer>;

function setup({
  server,
  save = server?.save,
  initial = server?.row.fields ?? fields(),
  onLeave,
}: {
  server?: Server;
  save?: SaveDraft;
  initial?: DraftFields;
  onLeave?: () => void;
}) {
  return renderHook(
    ({ value }: { value: DraftFields }) =>
      useDraftAutosave({
        comunicadoId: COMUNICADO_ID,
        initialVersion: OPENED,
        fields: value,
        save: save!,
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

/** A flush the test does not wait for, to watch it while requests go. */
function startFlush(controller: DraftAutosave) {
  const flush: { done: boolean; result: FlushResult | null } = {
    done: false,
    result: null,
  };
  act(() => {
    void controller.flush().then((result) => {
      flush.done = true;
      flush.result = result;
    });
  });
  return flush;
}

async function flushNow(controller: DraftAutosave) {
  let result: FlushResult | null = null;
  await act(async () => {
    result = await controller.flush();
  });
  return result;
}

describe("useDraftAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("saves nothing on open, and waits for the debounce after a change", async () => {
    const server = fakeServer(fields());
    const { result, rerender } = setup({ server });
    expect(result.current.status.kind).toBe("saved");
    expect(result.current.unsaved).toBe(false);

    rerender({ value: fields({ title: "Ho" }) });
    rerender({ value: fields({ title: "Hola" }) });
    expect(result.current.status.kind).toBe("saving");
    expect(result.current.unsaved).toBe(true);

    await advance(DEBOUNCE - 1);
    expect(server.save).not.toHaveBeenCalled();
    await advance(1);
    expect(server.save).toHaveBeenCalledTimes(1);
    // Only the last fields go, with the version the composer opened with.
    expect(server.requests[0]!.input).toMatchObject({
      comunicadoId: COMUNICADO_ID,
      expectedVersion: OPENED,
      title: "Hola",
    });
    expect(server.requests[0]!.input.saveKey).toMatch(UUID_V4);

    await server.requests[0]!.answer();
    expect(result.current.status.kind).toBe("saved");
    expect(result.current.unsaved).toBe(false);
    expect(server.row).toMatchObject({
      version: OPENED + 1,
      fields: fields({ title: "Hola" }),
    });
  });

  it("keeps one request in flight, then sends the latest fields at the version the server returned", async () => {
    const server = fakeServer(fields());
    const { result, rerender } = setup({ server });

    rerender({ value: fields({ title: "Uno" }) });
    await advance(DEBOUNCE);
    expect(server.save).toHaveBeenCalledTimes(1);

    // Two more changes while the first request is unanswered.
    rerender({ value: fields({ title: "Dos" }) });
    await advance(DEBOUNCE);
    rerender({ value: fields({ title: "Tres" }) });
    await advance(DEBOUNCE);
    expect(server.save).toHaveBeenCalledTimes(1);
    expect(result.current.status.kind).toBe("saving");

    await server.requests[0]!.answer();
    // The latest fields go at once, at the version just returned.
    expect(server.save).toHaveBeenCalledTimes(2);
    expect(server.requests[1]!.input).toMatchObject({
      expectedVersion: 4,
      title: "Tres",
    });
    expect(server.requests[1]!.input.saveKey).not.toBe(
      server.requests[0]!.input.saveKey,
    );

    await server.requests[1]!.answer();
    expect(result.current.status.kind).toBe("saved");
    expect(server.row).toMatchObject({ version: 5, fields: { title: "Tres" } });

    rerender({ value: fields({ title: "Cuatro" }) });
    await advance(DEBOUNCE);
    expect(server.requests[2]!.input.expectedVersion).toBe(5);
  });

  it("stops for good when another tab saved first", async () => {
    const server = fakeServer(fields({ title: "Antes" }));
    const { result, rerender } = setup({ server });
    server.otherTab({ title: "Otra pestaña" });

    rerender({ value: fields({ title: "Mío" }) });
    await advance(DEBOUNCE);
    await server.requests[0]!.answer();

    expect(result.current.status).toEqual({
      kind: "blocked",
      code: "STALE",
      message: REFUSALS.STALE,
    });
    // Nothing to warn about on leaving: reloading is the way out.
    expect(result.current.unsaved).toBe(false);

    rerender({ value: fields({ title: "Mío otra vez" }) });
    await advance(DEBOUNCE * 10);
    expect(server.save).toHaveBeenCalledTimes(1);
    expect(await flushNow(result.current.controller)).toEqual({
      ok: false,
      message: REFUSALS.STALE,
    });
    expect(server.row.fields.title).toBe("Otra pestaña");
  });

  it.each([
    ["NOT_DRAFT", "sent"],
    ["NOT_FOUND", "gone"],
  ] as const)("stops when the server answers %s", async (code, status) => {
    const server = fakeServer(fields());
    const { result, rerender } = setup({ server });
    server.row.status = status;

    rerender({ value: fields({ title: "x" }) });
    await advance(DEBOUNCE);
    await server.requests[0]!.answer();
    expect(result.current.status).toEqual({
      kind: "blocked",
      code,
      message: REFUSALS[code],
    });
    rerender({ value: fields({ title: "y" }) });
    await advance(DEBOUNCE * 2);
    expect(server.save).toHaveBeenCalledTimes(1);
  });

  it("surfaces a refused text while the other fields count as saved", async () => {
    const server = fakeServer(fields({ doc: [paragraph("Antes")] }));
    const { result, rerender } = setup({ server });

    rerender({ value: fields({ title: "Título", doc: [{ type: "table" }] }) });
    await advance(DEBOUNCE);
    await server.requests[0]!.answer();

    expect(result.current.status.kind).toBe("saved");
    expect(result.current.contentError).toBe(REFUSED_TEXT);
    expect(server.row.fields).toMatchObject({
      title: "Título",
      doc: [paragraph("Antes")],
    });
    // The text itself is not stored: leaving warns, and a test send waits.
    expect(result.current.unsaved).toBe(true);
    expect(await flushNow(result.current.controller)).toEqual({
      ok: false,
      message: REFUSED_TEXT,
    });
    expect(server.save).toHaveBeenCalledTimes(1);

    rerender({ value: fields({ title: "Título", doc: [paragraph("Bien")] }) });
    await advance(DEBOUNCE);
    await server.requests[1]!.answer();
    expect(result.current.contentError).toBeNull();
    expect(result.current.unsaved).toBe(false);
    expect(server.row.fields.doc).toEqual([paragraph("Bien")]);
  });

  it("keeps a text far over the limit out of the request, and saves the rest", async () => {
    const server = fakeServer(fields({ doc: [paragraph("Antes")] }));
    const { result, rerender } = setup({ server });
    const huge = [paragraph("a".repeat(COMUNICADO_DOC_MAX_BYTES * 2))];

    rerender({ value: fields({ title: "Largo", doc: huge }) });
    await advance(DEBOUNCE);
    const input = server.requests[0]!.input;
    expect(input).toMatchObject({ title: "Largo", expectedVersion: OPENED });
    expect("doc" in input).toBe(false);
    await server.requests[0]!.answer();

    expect(server.row.fields).toMatchObject({
      title: "Largo",
      doc: [paragraph("Antes")],
    });
    expect(result.current.status.kind).toBe("saved");
    expect(result.current.contentError).toBe(
      "El comunicado es demasiado largo. Acortá el texto.",
    );
    // The stored text is the old one: leaving warns, a test send waits.
    expect(result.current.unsaved).toBe(true);
    expect(await flushNow(result.current.controller)).toEqual({
      ok: false,
      message: "El comunicado es demasiado largo. Acortá el texto.",
    });

    // Short enough again, it goes, and the server has the last word.
    rerender({ value: fields({ title: "Largo", doc: [] }) });
    await advance(DEBOUNCE);
    expect(server.requests[1]!.input).toMatchObject({ doc: [] });
    await server.requests[1]!.answer();
    expect(result.current.contentError).toBeNull();
    expect(result.current.unsaved).toBe(false);
  });

  it("retries a failed request with a growing pause, with the same key and the fields on screen", async () => {
    const server = fakeServer(fields());
    const { result, rerender } = setup({ server });

    rerender({ value: fields({ title: "x" }) });
    await advance(DEBOUNCE);
    await server.requests[0]!.fail();
    expect(result.current.status.kind).toBe("retrying");
    expect(result.current.unsaved).toBe(true);

    await advance(retryDelayMs(1) - 1);
    expect(server.save).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(server.save).toHaveBeenCalledTimes(2);
    expect(server.requests[1]!.input).toMatchObject({
      saveKey: server.requests[0]!.input.saveKey,
      expectedVersion: OPENED,
      title: "x",
    });

    await server.requests[1]!.fail();
    await advance(retryDelayMs(2) - 1);
    expect(server.save).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(server.save).toHaveBeenCalledTimes(3);

    await server.requests[2]!.answer();
    expect(result.current.status.kind).toBe("saved");
    expect(server.row).toMatchObject({ version: 4, fields: { title: "x" } });
  });

  it("treats a thrown request as a failure to retry", async () => {
    const server = fakeServer(fields());
    const { result, rerender } = setup({ server });
    rerender({ value: fields({ title: "x" }) });
    await advance(DEBOUNCE);
    await server.requests[0]!.drop();
    expect(result.current.status.kind).toBe("retrying");

    await advance(retryDelayMs(1));
    expect(server.save).toHaveBeenCalledTimes(2);
    await server.requests[1]!.answer();
    expect(result.current.status.kind).toBe("saved");
  });

  it("flushes without waiting for the debounce", async () => {
    const server = fakeServer(fields());
    const { result, rerender } = setup({ server });
    rerender({ value: fields({ title: "Ya" }) });

    const flush = startFlush(result.current.controller);
    expect(server.save).toHaveBeenCalledTimes(1);
    expect(server.requests[0]!.input).toMatchObject({ title: "Ya" });
    await server.requests[0]!.answer();
    expect(flush.result).toEqual({ ok: true });

    // The debounce that was pending does not save the same fields again.
    await advance(DEBOUNCE * 2);
    expect(server.save).toHaveBeenCalledTimes(1);
  });

  it("gives up a flush on the first failure, leaving the retry scheduled", async () => {
    const server = fakeServer(fields());
    const { result, rerender } = setup({ server });
    rerender({ value: fields({ title: "Ya" }) });

    const flush = startFlush(result.current.controller);
    await server.requests[0]!.fail();
    expect(flush.result).toEqual(FLUSH_FAILED);

    await advance(retryDelayMs(1));
    expect(server.save).toHaveBeenCalledTimes(2);
    await server.requests[1]!.answer();
    expect(result.current.status.kind).toBe("saved");
  });

  it("pauses after the request in flight, so a discard races no save", async () => {
    const server = fakeServer(fields());
    const { result, rerender } = setup({ server });
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
    await server.requests[0]!.answer();
    expect(paused).toBe(true);

    // "Dos" waits while paused…
    await advance(DEBOUNCE * 2);
    expect(server.save).toHaveBeenCalledTimes(1);

    // …and goes once resumed (the discard failed).
    act(() => resume());
    expect(server.save).toHaveBeenCalledTimes(2);
    expect(server.requests[1]!.input).toMatchObject({
      expectedVersion: 4,
      title: "Dos",
    });
  });

  it("ignores a refusal of fields already replaced, and saves the newer ones", async () => {
    const server = fakeServer(fields());
    const { result, rerender } = setup({ server });

    rerender({ value: fields({ title: "x".repeat(301) }) });
    await advance(DEBOUNCE);
    rerender({ value: fields({ title: "Uno dos" }) });
    await advance(DEBOUNCE);
    await server.requests[0]!.answer();
    expect(server.requests[0]!.result).toMatchObject({ code: "INVALID" });

    // Not about what is on screen: no error stays, and the newer fields go.
    expect(result.current.status.kind).toBe("saving");
    expect(server.save).toHaveBeenCalledTimes(2);
    expect(server.requests[1]!.input).toMatchObject({
      title: "Uno dos",
      expectedVersion: OPENED,
    });
    await server.requests[1]!.answer();
    expect(result.current.status.kind).toBe("saved");
  });

  it("keeps a refusal of what is still on screen until the next change", async () => {
    const server = fakeServer(fields());
    const { result, rerender } = setup({ server });

    rerender({ value: fields({ title: "x".repeat(301) }) });
    await advance(DEBOUNCE);
    await server.requests[0]!.answer();
    const refusal = server.requests[0]!.result;
    if (refusal?.success !== false) throw new Error("expected a refusal");
    expect(result.current.status).toEqual({
      kind: "invalid",
      message: refusal.message,
    });
    expect(result.current.unsaved).toBe(true);
    await advance(DEBOUNCE * 4);
    expect(server.save).toHaveBeenCalledTimes(1);
    expect(await flushNow(result.current.controller)).toEqual({
      ok: false,
      message: refusal.message,
    });

    rerender({ value: fields({ title: "Corto" }) });
    await advance(DEBOUNCE);
    await server.requests[1]!.answer();
    expect(result.current.status.kind).toBe("saved");
  });

  it("settles a stored save whose answer was lost, after the admin undid it", async () => {
    const opened = fields({ title: "Antes" });
    const server = fakeServer(opened);
    const { result, rerender } = setup({ server });

    rerender({ value: fields({ title: "Después" }) });
    await advance(DEBOUNCE);
    // Stored, but the answer never came back.
    await server.requests[0]!.lose();
    expect(server.row).toMatchObject({
      version: 4,
      fields: { title: "Después" },
    });

    // Undone before the retry: the screen is what the composer last knew
    // stored, but the server holds "Después".
    rerender({ value: opened });
    expect(result.current.status.kind).not.toBe("saved");
    expect(result.current.unsaved).toBe(true);

    const flush = startFlush(result.current.controller);
    // The screen goes with the lost request's key, which the server knows.
    expect(server.requests[1]!.input).toMatchObject({
      title: "Antes",
      expectedVersion: OPENED,
      saveKey: server.requests[0]!.input.saveKey,
    });
    await server.requests[1]!.answer();
    expect(server.requests[1]!.result).toMatchObject({
      success: true,
      version: 4,
      replayed: true,
    });
    expect(flush.done).toBe(false);
    expect(result.current.status.kind).toBe("saving");

    // What that request carried is not known here: the screen goes again.
    expect(server.requests[2]!.input).toMatchObject({
      title: "Antes",
      expectedVersion: 4,
    });
    expect(server.requests[2]!.input.saveKey).not.toBe(
      server.requests[0]!.input.saveKey,
    );
    await server.requests[2]!.answer();

    expect(server.row).toMatchObject({ version: 5, fields: opened });
    expect(flush.result).toEqual({ ok: true });
    expect(result.current.status.kind).toBe("saved");
    expect(result.current.unsaved).toBe(false);
    await advance(retryDelayMs(5) * 2);
    expect(server.save).toHaveBeenCalledTimes(3);
  });

  it("carries a lost save's key with the next edit, and takes the replay for no other tab's", async () => {
    const server = fakeServer(fields());
    const { result, rerender } = setup({ server });

    rerender({ value: fields({ title: "Uno" }) });
    await advance(DEBOUNCE);
    await server.requests[0]!.lose();

    // The admin keeps typing before the retry.
    rerender({ value: fields({ title: "Uno dos" }) });
    await advance(DEBOUNCE);
    expect(server.requests[1]!.input).toMatchObject({
      title: "Uno dos",
      expectedVersion: OPENED,
      saveKey: server.requests[0]!.input.saveKey,
    });
    await server.requests[1]!.answer();
    expect(server.requests[1]!.result).toMatchObject({ replayed: true });

    expect(server.requests[2]!.input).toMatchObject({
      title: "Uno dos",
      expectedVersion: 4,
    });
    await server.requests[2]!.answer();
    expect(result.current.status.kind).toBe("saved");
    expect(server.row).toMatchObject({
      version: 5,
      fields: fields({ title: "Uno dos" }),
    });
    expect(server.save).toHaveBeenCalledTimes(3);
  });

  it("writes the fields on screen when the failed request was never stored", async () => {
    const opened = fields({ title: "Antes" });
    const server = fakeServer(opened);
    const { result, rerender } = setup({ server });

    rerender({ value: fields({ title: "Uno" }) });
    await advance(DEBOUNCE);
    await server.requests[0]!.fail();
    expect(server.row.version).toBe(OPENED);

    rerender({ value: fields({ title: "Dos" }) });
    await advance(DEBOUNCE);
    expect(server.requests[1]!.input).toMatchObject({
      title: "Dos",
      expectedVersion: OPENED,
      saveKey: server.requests[0]!.input.saveKey,
    });
    await server.requests[1]!.answer();
    expect(server.requests[1]!.result).toMatchObject({ replayed: false });
    expect(result.current.status.kind).toBe("saved");
    expect(server.row).toMatchObject({ version: 4, fields: { title: "Dos" } });
    expect(server.save).toHaveBeenCalledTimes(2);

    // Answered: the key is done with.
    rerender({ value: fields({ title: "Tres" }) });
    await advance(DEBOUNCE);
    expect(server.requests[2]!.input.saveKey).not.toBe(
      server.requests[0]!.input.saveKey,
    );
  });

  it("settles a failed request even when the fields went back to what is stored", async () => {
    const opened = fields({ title: "Antes" });
    const server = fakeServer(opened);
    const { result, rerender } = setup({ server });

    rerender({ value: fields({ title: "Otro" }) });
    await advance(DEBOUNCE);
    rerender({ value: opened });
    await server.requests[0]!.fail();
    expect(result.current.status.kind).toBe("retrying");

    // Not stored, so the server writes what is on screen.
    await advance(retryDelayMs(1));
    expect(server.requests[1]!.input).toMatchObject({
      title: "Antes",
      saveKey: server.requests[0]!.input.saveKey,
    });
    await server.requests[1]!.answer();
    expect(server.requests[1]!.result).toMatchObject({ replayed: false });
    expect(result.current.status.kind).toBe("saved");
    expect(server.row).toMatchObject({ version: 4, fields: opened });
  });

  it("stops when another tab saved after the lost save", async () => {
    const server = fakeServer(fields());
    const { result, rerender } = setup({ server });

    rerender({ value: fields({ title: "Uno" }) });
    await advance(DEBOUNCE);
    await server.requests[0]!.lose();
    server.otherTab({ title: "Otra pestaña" });

    await advance(retryDelayMs(1));
    expect(server.requests[1]!.input.saveKey).toBe(
      server.requests[0]!.input.saveKey,
    );
    await server.requests[1]!.answer();
    expect(result.current.status).toEqual({
      kind: "blocked",
      code: "STALE",
      message: REFUSALS.STALE,
    });
    await advance(retryDelayMs(5) * 2);
    expect(server.save).toHaveBeenCalledTimes(2);
    expect(server.row.fields.title).toBe("Otra pestaña");
  });

  it("takes no failure in a row for another tab's save, however many edits went out", async () => {
    const server = fakeServer(fields());
    const { result, rerender } = setup({ server });

    // Offline while typing: every pause sends, and only one gets through,
    // late in the outage, with its answer lost.
    for (let index = 0; index < 8; index += 1) {
      rerender({ value: fields({ title: `Versión ${index}` }) });
      await advance(DEBOUNCE);
      const request = server.requests[index]!;
      if (index === 6) await request.lose();
      else await request.fail();
    }
    expect(server.row).toMatchObject({
      version: 4,
      fields: { title: "Versión 6" },
    });

    rerender({ value: fields({ title: "Al volver" }) });
    await advance(DEBOUNCE);
    await server.answerAll();

    expect(result.current.status.kind).toBe("saved");
    expect(server.row).toMatchObject({
      version: 5,
      fields: { title: "Al volver" },
    });
    // One key until an answer, then a new one.
    const keys = server.requests.map((request) => request.input.saveKey);
    expect(new Set(keys.slice(0, 9)).size).toBe(1);
    expect(keys).toHaveLength(10);
    expect(keys[9]).not.toBe(keys[0]);
  });

  it("stops when a new release replaced the action, warning that the latest changes are not saved", async () => {
    const save = vi
      .fn<SaveDraft>()
      .mockRejectedValue(
        new UnrecognizedActionError('Server Action "abc" was not found'),
      );
    const { result, rerender } = setup({ save });
    rerender({ value: fields({ title: "x" }) });
    await advance(DEBOUNCE);

    // Closing the tab still warns: the changes exist only on screen.
    expect(result.current.unsaved).toBe(true);
    expect(result.current.status).toEqual({
      kind: "blocked",
      code: "OUTDATED",
      message:
        "Se publicó una nueva versión de Glitter. Tus últimos cambios no se guardaron: copialos y recargá la página.",
    });
    expect(OUTDATED_MESSAGE).toBe(
      "Se publicó una nueva versión de Glitter. Tus últimos cambios no se guardaron: copialos y recargá la página.",
    );

    rerender({ value: fields({ title: "y" }) });
    await advance(retryDelayMs(5) * 2);
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.unsaved).toBe(true);
    expect(await flushNow(result.current.controller)).toEqual({
      ok: false,
      message: OUTDATED_MESSAGE,
    });
  });

  it("saves what is on screen once on leaving, and refreshes after it", async () => {
    const server = fakeServer(fields());
    const onLeave = vi.fn();
    const { rerender, unmount } = setup({ server, onLeave });

    rerender({ value: fields({ title: "Uno" }) });
    await advance(DEBOUNCE);
    await server.requests[0]!.answer();
    rerender({ value: fields({ title: "Uno dos" }) });

    unmount();
    // What was typed last goes at once, and only then is the page left.
    await advance(0);
    expect(server.requests[1]!.input).toMatchObject({ title: "Uno dos" });
    expect(onLeave).not.toHaveBeenCalled();
    await server.requests[1]!.answer();
    expect(onLeave).toHaveBeenCalledTimes(1);
    await advance(DEBOUNCE * 4);
    expect(server.save).toHaveBeenCalledTimes(2);
  });

  it("retries nothing after leaving, and refreshes when the failed request may be stored", async () => {
    const server = fakeServer(fields());
    const onLeave = vi.fn();
    const { rerender, unmount } = setup({ server, onLeave });

    rerender({ value: fields({ title: "Uno" }) });
    unmount();
    await advance(0);
    expect(server.save).toHaveBeenCalledTimes(1);
    await server.requests[0]!.drop({ stored: true });

    await advance(retryDelayMs(5) * 4);
    expect(server.save).toHaveBeenCalledTimes(1);
    // No answer said so, but the server holds it: the router must read it.
    expect(server.row.fields.title).toBe("Uno");
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("neither saves nor refreshes on leaving when nothing was sent", async () => {
    const server = fakeServer(fields());
    const onLeave = vi.fn();
    const { unmount } = setup({ server, onLeave });
    unmount();
    await advance(DEBOUNCE * 2);
    expect(server.save).not.toHaveBeenCalled();
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("neither saves nor refreshes on leaving a discarded draft", async () => {
    const server = fakeServer(fields());
    const onLeave = vi.fn();
    const { result, rerender, unmount } = setup({ server, onLeave });

    rerender({ value: fields({ title: "Uno" }) });
    await advance(DEBOUNCE);
    await server.requests[0]!.answer();
    rerender({ value: fields({ title: "Uno dos" }) });

    await act(async () => {
      await result.current.controller.pause();
    });
    server.row.status = "gone";
    act(() => result.current.controller.markDiscarded());
    unmount();

    await advance(retryDelayMs(5) * 2);
    expect(server.save).toHaveBeenCalledTimes(1);
    expect(onLeave).not.toHaveBeenCalled();
  });

  describe("where crypto.randomUUID is missing, as over plain http", () => {
    beforeEach(() => {
      const real = globalThis.crypto;
      vi.stubGlobal("crypto", {
        getRandomValues: <T extends ArrayBufferView>(array: T) =>
          real.getRandomValues(array),
      });
    });

    it("saves with a key the action takes", async () => {
      const server = fakeServer(fields());
      const { result, rerender } = setup({ server });
      rerender({ value: fields({ title: "Desde el celular" }) });
      await advance(DEBOUNCE);
      expect(server.save).toHaveBeenCalledTimes(1);
      expect(server.requests[0]!.input.saveKey).toMatch(UUID_V4);
      await server.requests[0]!.answer();
      expect(server.requests[0]!.result).toMatchObject({ success: true });
      expect(result.current.status.kind).toBe("saved");
      expect(server.row.fields.title).toBe("Desde el celular");
    });

    it("builds distinct version 4 keys", () => {
      const keys = Array.from({ length: 50 }, () => newSaveKey());
      for (const key of keys) expect(key).toMatch(UUID_V4);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  it("keeps saving after Strict Mode's unmount and mount again", async () => {
    const server = fakeServer(fields());
    const onLeave = vi.fn();
    const { result, rerender } = renderHook(
      ({ value }: { value: DraftFields }) =>
        useDraftAutosave({
          comunicadoId: COMUNICADO_ID,
          initialVersion: OPENED,
          fields: value,
          save: server.save,
          debounceMs: DEBOUNCE,
          onLeave,
        }),
      { initialProps: { value: fields() }, wrapper: StrictMode },
    );
    await advance(0);

    rerender({ value: fields({ title: "Uno" }) });
    await advance(DEBOUNCE);
    expect(server.save).toHaveBeenCalledTimes(1);
    await server.requests[0]!.answer();
    expect(result.current.status.kind).toBe("saved");
    expect(onLeave).not.toHaveBeenCalled();
  });
});
