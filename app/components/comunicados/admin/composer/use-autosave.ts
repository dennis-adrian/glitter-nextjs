"use client";

import { unstable_isUnrecognizedActionError } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type {
  SaveComunicadoDraftActionResult,
  SaveComunicadoDraftFailureCode,
} from "@/app/lib/comunicados/actions";
import {
  COMUNICADO_AUTOSAVE_DEBOUNCE_MS,
  COMUNICADO_DOC_MAX_BYTES,
  type ComunicadoDraftInput,
} from "@/app/lib/comunicados/definitions";

/**
 * The composer's autosave (docs/IMPLEMENTATION-comunicados.md G4, E1): a
 * debounce after the last change, then one request at a time, always with
 * the fields on screen and the `version` the server last confirmed, which it
 * compares and sets.
 *
 * A request whose outcome is unknown (it threw, or the server failed) may be
 * stored all the same. Every request after it carries its key until one is
 * answered, so the server can tell: "replayed" means a request with that key
 * was stored and this one was not, so what is on screen goes again.
 *
 * A refusal that waiting cannot fix (another tab saved, the comunicado left
 * the draft state or is gone, a new release replaced the actions) stops it
 * for good; a failed request retries with a growing pause.
 */

export type DraftFields = Omit<
  ComunicadoDraftInput,
  "comunicadoId" | "expectedVersion" | "saveKey" | "doc"
> & { doc: unknown[] };

export type SaveDraft = (
  input: ComunicadoDraftInput,
) => Promise<SaveComunicadoDraftActionResult>;

type BlockingCode =
  | Exclude<SaveComunicadoDraftFailureCode, "FAILED" | "INVALID">
  /** A new release: the actions this page calls are gone from the server. */
  | "OUTDATED";

type Blocking = { code: BlockingCode; message: string };

export type AutosaveStatus =
  /** Everything on screen is stored (the text may have been refused). */
  | { kind: "saved" }
  /** A change waits for the debounce or is being saved. */
  | { kind: "saving" }
  /** The last attempt failed; another one is scheduled. */
  | { kind: "retrying" }
  /** The server refused what is on screen; the next change tries again. */
  | { kind: "invalid"; message: string }
  /** Saving stopped: reloading is the way out. */
  | ({ kind: "blocked" } & Blocking);

export type AutosaveSnapshot = {
  status: AutosaveStatus;
  /** The text the server refused on the last save; the other fields saved. */
  contentError: string | null;
  /** Something on screen is not stored yet, the refused text included. */
  unsaved: boolean;
};

export type FlushResult = { ok: true } | { ok: false; message: string };

const FAILED_MESSAGE =
  "No se pudo guardar el borrador. Probá de nuevo en unos segundos.";

export const OUTDATED_MESSAGE =
  "Se publicó una nueva versión de Glitter. Tus últimos cambios no se guardaron: copialos y recargá la página.";

/** What the server says of a text over `COMUNICADO_DOC_MAX_BYTES`. */
export const DOC_TOO_LONG_MESSAGE =
  "El comunicado es demasiado largo. Acortá el texto.";

/**
 * A text so far over the limit that it is not worth sending: the server
 * would refuse it anyway, after a request that size. The server measures
 * UTF-8 bytes; a UTF-16 length past twice the limit is past it for sure.
 */
export function isDocFarTooLong(doc: unknown[]) {
  return JSON.stringify(doc).length > COMUNICADO_DOC_MAX_BYTES * 2;
}

/** 2 s, 4 s, 8 s, 16 s, then every 30 s. */
export function retryDelayMs(attempt: number) {
  return Math.min(30_000, 1_000 * 2 ** Math.max(1, attempt));
}

/**
 * A new `saveKey`. `crypto.randomUUID` exists only in secure contexts, so a
 * page opened over plain http (a phone testing on the LAN) builds the same
 * version 4 UUID from `getRandomValues`.
 */
export function newSaveKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

type ControllerOptions = {
  comunicadoId: number;
  version: number;
  /** The fields as stored when the composer opened, serialized. */
  baseline: string;
  save: SaveDraft;
  debounceMs: number;
};

/** One request: the fields it carried, serialized, and its key. */
type Sent = { fields: string; key: string; docLeftOut: boolean };

type Answer =
  | SaveComunicadoDraftActionResult
  | { success: false; code: "OUTDATED"; message: string };

function answerToThrown(error: unknown): Answer {
  // A release replaced the actions: no retry reaches them again.
  if (unstable_isUnrecognizedActionError(error)) {
    return { success: false, code: "OUTDATED", message: OUTDATED_MESSAGE };
  }
  console.error("Error autosaving a comunicado draft", error);
  return { success: false, code: "FAILED", message: FAILED_MESSAGE };
}

/**
 * The autosave's state machine, outside React so its timers and the one
 * request in flight survive re-renders.
 */
export class DraftAutosave {
  /** The fields on screen, serialized. */
  private latest: string;
  /** The fields stored at `version`, serialized; null when not known. */
  private saved: string | null;
  /** The last version the server confirmed. */
  private version: number;
  private inFlight: Promise<void> | null = null;
  /** A request that may be stored: its key goes with every request after. */
  private uncertain: { key: string } | null = null;
  private blocked: Blocking | null = null;
  /** The server refused the fields on screen. */
  private invalid: string | null = null;
  private contentError: string | null = null;
  /** The last answer was a failure, and a retry is owed. */
  private failed = false;
  /** Failures in a row, for the retry's pause. */
  private attempt = 0;
  /** Every failure so far, so a flush notices one. */
  private failures = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private paused = 0;
  private storedOnce = false;
  /** Unmounted: the flush that follows retries nothing. */
  private leaving = false;
  private disposed = false;
  /** Discarded or sent: no longer a draft, and leaving refreshes nothing. */
  private ended = false;
  /** One per mount, so a remount stops the previous unmount's disposal. */
  private session = 0;
  private listener: ((snapshot: AutosaveSnapshot) => void) | null = null;

  constructor(private readonly options: ControllerOptions) {
    this.latest = options.baseline;
    this.saved = options.baseline;
    this.version = options.version;
  }

  listen(listener: (snapshot: AutosaveSnapshot) => void) {
    this.listener = listener;
    listener(this.snapshot());
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  }

  snapshot(): AutosaveSnapshot {
    return {
      status: this.status(),
      contentError: this.contentError,
      unsaved: this.unsaved(),
    };
  }

  /** What is on screen is stored, as far as the server has said. */
  private settled() {
    return (
      this.uncertain === null &&
      this.saved !== null &&
      this.latest === this.saved
    );
  }

  private idle() {
    return (
      this.settled() &&
      this.inFlight === null &&
      this.timer === null &&
      this.invalid === null &&
      this.blocked === null
    );
  }

  private unsaved() {
    if (this.blocked) {
      // Reloading is the way out when the stored draft won (another tab, a
      // send, a discard). A new release or a lost permission refuses nothing
      // on screen: what the server never got, a refused text included, stays
      // there to be copied, and leaving still warns.
      const storedWon =
        this.blocked.code === "STALE" ||
        this.blocked.code === "NOT_DRAFT" ||
        this.blocked.code === "NOT_FOUND";
      return !storedWon && (!this.settled() || this.contentError !== null);
    }
    return !this.idle() || this.contentError !== null;
  }

  private status(): AutosaveStatus {
    if (this.blocked) return { kind: "blocked", ...this.blocked };
    if (this.invalid !== null)
      return { kind: "invalid", message: this.invalid };
    if (this.failed) return { kind: "retrying" };
    return this.idle() ? { kind: "saved" } : { kind: "saving" };
  }

  private emit() {
    this.listener?.(this.snapshot());
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private clearRetry() {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  /**
   * Something is owed to the server: fields it may not have, or a request it
   * may have stored, which only another request can settle.
   */
  private wantsSend() {
    return (
      !this.disposed &&
      this.blocked === null &&
      this.invalid === null &&
      !this.settled()
    );
  }

  /** The fields on screen changed: save them a moment after the last change. */
  update(serialized: string) {
    if (serialized === this.latest || this.disposed) return;
    this.latest = serialized;
    // A change is a new attempt: what the server refused may be fixed now.
    this.invalid = null;
    this.clearTimer();
    if (this.paused === 0 && this.wantsSend()) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.pump();
        this.emit();
      }, this.options.debounceMs);
    }
    this.emit();
  }

  /** Sends what is owed, unless a request is out or saving is paused. */
  private pump() {
    if (this.inFlight !== null || this.paused > 0 || !this.wantsSend()) return;
    this.clearTimer();
    this.clearRetry();
    const sent: Sent = {
      fields: this.latest,
      // The server stored that request or not: either way it tells by the key.
      key: this.uncertain?.key ?? newSaveKey(),
      docLeftOut: false,
    };
    const { doc, ...fields } = JSON.parse(sent.fields) as DraftFields;
    // Left out, the stored text stays and every other field still saves.
    sent.docLeftOut = isDocFarTooLong(doc);
    let request: Promise<SaveComunicadoDraftActionResult>;
    try {
      request = this.options.save({
        ...fields,
        ...(sent.docLeftOut ? {} : { doc }),
        saveKey: sent.key,
        comunicadoId: this.options.comunicadoId,
        expectedVersion: this.version,
      });
    } catch (error) {
      request = Promise.reject(error);
    }
    this.inFlight = request.then(
      (result) => {
        this.answer(sent, result);
        this.emit();
      },
      (error: unknown) => {
        this.answer(sent, answerToThrown(error));
        this.emit();
      },
    );
    this.emit();
  }

  private answer(sent: Sent, result: Answer) {
    this.inFlight = null;
    if (result.success) {
      this.failed = false;
      this.attempt = 0;
      this.version = result.version;
      this.uncertain = null;
      this.storedOnce = true;
      if (result.replayed) {
        // An earlier request with this key was stored, not this one: which
        // fields it carried is not known here, so what is on screen goes now.
        this.saved = null;
        this.clearTimer();
      } else {
        this.saved = sent.fields;
        // The server never saw the text, so it is the one to say it.
        this.contentError = sent.docLeftOut
          ? DOC_TOO_LONG_MESSAGE
          : result.contentError;
      }
    } else if (result.code === "FAILED") {
      this.failure(sent);
      return;
    } else {
      this.failed = false;
      this.attempt = 0;
      if (result.code !== "INVALID") {
        this.block({ code: result.code, message: result.message });
      } else if (sent.fields === this.latest) {
        // About fields already replaced, it says nothing of the newer ones.
        this.invalid = result.message;
      }
    }
    // Changes made meanwhile, whose pause already ran, wait for nothing.
    if (!this.wantsSend()) this.clearTimer();
    else if (this.timer === null) this.pump();
  }

  /** Lost on the way back, it may be stored: its key goes on. */
  private failure(sent: Sent) {
    this.uncertain ??= { key: sent.key };
    this.failed = true;
    this.attempt += 1;
    this.failures += 1;
    if (this.leaving || this.paused > 0) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.pump();
      this.emit();
    }, retryDelayMs(this.attempt));
  }

  private block(blocking: Blocking) {
    this.blocked = blocking;
    this.clearTimer();
    this.clearRetry();
  }

  private dispose() {
    this.disposed = true;
    this.clearTimer();
    this.clearRetry();
  }

  /**
   * Saves what is on screen now, without waiting for the debounce: before a
   * test send, on blur and when the tab is hidden. Resolves once it is stored,
   * or on the first refusal or failure; a failure leaves its retry scheduled.
   */
  async flush(): Promise<FlushResult> {
    const failures = this.failures;
    for (;;) {
      if (this.inFlight !== null) {
        await this.inFlight;
        continue;
      }
      if (this.failures !== failures) {
        return { ok: false, message: FAILED_MESSAGE };
      }
      if (this.blocked) return { ok: false, message: this.blocked.message };
      if (this.invalid !== null) return { ok: false, message: this.invalid };
      if (this.settled()) {
        return this.contentError === null
          ? { ok: true }
          : { ok: false, message: this.contentError };
      }
      this.pump();
      // Paused, or stopped for good.
      if (this.inFlight === null) return { ok: false, message: FAILED_MESSAGE };
    }
  }

  /**
   * Stops saving and waits for the request in flight, as discarding needs:
   * no save may reach a draft being deleted. Resolves with a resume function.
   */
  async pause(): Promise<() => void> {
    this.paused += 1;
    this.clearTimer();
    this.clearRetry();
    while (this.inFlight !== null) await this.inFlight;
    this.emit();
    let resumed = false;
    return () => {
      if (resumed) return;
      resumed = true;
      this.paused -= 1;
      if (this.paused > 0) return;
      this.pump();
      this.emit();
    };
  }

  /**
   * The last version the server confirmed, which a send expects to find
   * (G5). Once a flush succeeds it is the version of what is on screen.
   */
  storedVersion() {
    return this.version;
  }

  /** The draft is deleted: nothing saves again, and leaving refreshes nothing. */
  markDiscarded() {
    this.end();
  }

  /**
   * The comunicado is sent and no longer a draft: nothing saves again, and
   * leaving refreshes nothing, since the send refreshes the page itself.
   */
  markSent() {
    this.end();
  }

  private end() {
    this.ended = true;
    this.dispose();
  }

  /** The component mounted (again, under Strict Mode's check). */
  attach() {
    this.session += 1;
    this.leaving = false;
  }

  /**
   * Whether leaving now may leave something stored behind the router's back:
   * a stored save, or one in flight, pending or of unknown outcome.
   */
  mayStoreOnLeave() {
    return (
      !this.ended &&
      (this.storedOnce ||
        this.uncertain !== null ||
        this.inFlight !== null ||
        this.timer !== null)
    );
  }

  /**
   * The component unmounted: saves what is on screen once, retries nothing
   * after it, and stops. Resolves whether a request of this mount may have
   * stored something, so what the router keeps can be refreshed.
   */
  async leave(): Promise<boolean> {
    const session = this.session;
    this.leaving = true;
    await this.flush();
    // Mounted again meanwhile: it goes on saving.
    if (session !== this.session) return false;
    this.dispose();
    return !this.ended && (this.storedOnce || this.uncertain !== null);
  }
}

/**
 * `DraftAutosave` for a component: hand it the fields on screen on every
 * render; it saves them when they change.
 *
 * `onLeave` runs when the component unmounts after a request may have stored
 * something, once what was on screen is saved too, unless the draft was
 * discarded or sent. The router keeps the pages it rendered for Back and Forward: the
 * composer with the fields and the version it opened with, the list with the
 * titles it had. Refreshing there drops them.
 */
export function useDraftAutosave({
  comunicadoId,
  initialVersion,
  fields,
  save,
  debounceMs = COMUNICADO_AUTOSAVE_DEBOUNCE_MS,
  onLeave,
}: {
  comunicadoId: number;
  initialVersion: number;
  fields: DraftFields;
  save: SaveDraft;
  debounceMs?: number;
  onLeave?: () => void;
}) {
  const serialized = JSON.stringify(fields);
  // Made once: the fields at first render are what is stored.
  const [controller] = useState(
    () =>
      new DraftAutosave({
        comunicadoId,
        version: initialVersion,
        baseline: serialized,
        save,
        debounceMs,
      }),
  );
  const [snapshot, setSnapshot] = useState<AutosaveSnapshot>(() =>
    controller.snapshot(),
  );
  const leaveRef = useRef(onLeave);

  useEffect(() => {
    leaveRef.current = onLeave;
  });

  useEffect(() => controller.listen(setSnapshot), [controller]);

  useEffect(() => {
    controller.update(serialized);
  }, [controller, serialized]);

  useEffect(() => {
    controller.attach();
    return () => {
      // At once, so a Back pressed while the last save is still on its way
      // does not bring back the composer as it first opened; and again once
      // that save settles, since the refresh may have read the draft before it.
      if (controller.mayStoreOnLeave()) leaveRef.current?.();
      void controller.leave().then((mayHaveStored) => {
        if (mayHaveStored) leaveRef.current?.();
      });
    };
  }, [controller]);

  return { ...snapshot, controller };
}
