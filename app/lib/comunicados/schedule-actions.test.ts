// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  logFailure: vi.fn(),
  revalidatePath: vi.fn(),
  schedule: vi.fn(),
  reschedule: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/app/lib/comunicados/actor", () => ({
  comunicadosActor: mocks.actor,
  logComunicadosFailure: mocks.logFailure,
}));
vi.mock("@/app/lib/comunicados/schedule", () => ({
  scheduleComunicado: mocks.schedule,
  rescheduleComunicado: mocks.reschedule,
  cancelComunicadoSchedule: mocks.cancel,
}));

import type { ScheduleRefusalCode } from "@/app/lib/comunicados/contracts";
import { SEND_REFUSAL_CODES } from "@/app/lib/comunicados/contracts";
import {
  cancelComunicadoScheduleAction,
  rescheduleComunicadoAction,
  scheduleComunicadoAction,
} from "@/app/lib/comunicados/schedule-actions";

const ADMIN = { id: 42, role: "admin" };
const BLOCKED = { success: false, message: "No autorizado." } as const;
/** Saturday 31 October 2026, 9:00 in La Paz. */
const AT_ISO = "2026-10-31T13:00:00.000Z";
const AT = new Date(AT_ISO);
const SCHEDULE = {
  comunicadoId: 7,
  expectedVersion: 3,
  scheduledAt: AT_ISO,
  typedCount: null,
};
const RESCHEDULE = { comunicadoId: 7, expectedVersion: 4, scheduledAt: AT_ISO };
const UNREADABLE = {
  success: false,
  code: "INVALID",
  message: "No pudimos leer la programación. Probá de nuevo.",
};
const REFUSAL_CODES: ScheduleRefusalCode[] = [
  ...SEND_REFUSAL_CODES,
  "DEVELOPMENT",
  "INVALID_DATE",
  "NOT_SCHEDULED",
];

beforeEach(() => {
  mocks.actor.mockResolvedValue({ actor: ADMIN, blocked: null });
  mocks.schedule.mockResolvedValue({ ok: true, version: 4, scheduledAt: AT });
  mocks.reschedule.mockResolvedValue({ ok: true, version: 5, scheduledAt: AT });
  mocks.cancel.mockResolvedValue({ ok: true, version: 5, alreadyDraft: false });
});

afterEach(() => {
  vi.clearAllMocks();
});

const ACTIONS = [
  ["scheduleComunicadoAction", scheduleComunicadoAction, SCHEDULE],
  ["rescheduleComunicadoAction", rescheduleComunicadoAction, RESCHEDULE],
  [
    "cancelComunicadoScheduleAction",
    cancelComunicadoScheduleAction,
    { comunicadoId: 7 },
  ],
] as const;

describe.each(ACTIONS)("%s", (_name, action, input) => {
  it("refuses anyone the guard refuses before reading the input", async () => {
    mocks.actor.mockResolvedValue({ actor: null, blocked: BLOCKED });

    expect(await action("nada")).toEqual({ ...BLOCKED, code: "FORBIDDEN" });
    expect(await action(input)).toEqual({ ...BLOCKED, code: "FORBIDDEN" });
    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.reschedule).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["nothing", undefined],
    ["an id that is not one", { ...input, comunicadoId: "7" }],
    ["id 0", { ...input, comunicadoId: 0 }],
  ])("refuses %s without changing anything", async (_label, bad) => {
    expect(await action(bad)).toEqual(UNREADABLE);
    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.reschedule).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
});

describe.each([
  ["scheduleComunicadoAction", scheduleComunicadoAction, SCHEDULE],
  ["rescheduleComunicadoAction", rescheduleComunicadoAction, RESCHEDULE],
] as const)("%s's time and version", (_name, action, input) => {
  it.each([
    ["version 0", { ...input, expectedVersion: 0 }],
    ["no version", { ...input, expectedVersion: undefined }],
    ["no time", { ...input, scheduledAt: undefined }],
    ["a time that is not one", { ...input, scheduledAt: "mañana" }],
    // Read in the server's own zone, so never accepted: only an instant is.
    ["a time without its zone", { ...input, scheduledAt: "2026-10-31T09:00" }],
    [
      "a day that does not exist",
      { ...input, scheduledAt: "2026-02-30T13:00:00.000Z" },
    ],
    ["a number for a time", { ...input, scheduledAt: AT.getTime() }],
  ])("refuses %s without changing anything", async (_label, bad) => {
    expect(await action(bad)).toEqual(UNREADABLE);
    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.reschedule).not.toHaveBeenCalled();
  });
});

describe("scheduleComunicadoAction", () => {
  it.each([
    ["a negative count", { ...SCHEDULE, typedCount: -1 }],
    ["a fractional count", { ...SCHEDULE, typedCount: 1.5 }],
    [
      "no count at all",
      { comunicadoId: 7, expectedVersion: 3, scheduledAt: AT_ISO },
    ],
  ])("refuses %s", async (_label, input) => {
    expect(await scheduleComunicadoAction(input)).toEqual(UNREADABLE);
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("schedules as the acting admin at the instant picked, and refreshes the list and the page", async () => {
    expect(
      await scheduleComunicadoAction({ ...SCHEDULE, typedCount: 312 }),
    ).toEqual({
      success: true,
      message: "Quedó programado para el sáb, 31 oct, 9:00 AM.",
    });
    expect(mocks.schedule).toHaveBeenCalledWith({
      comunicadoId: 7,
      by: ADMIN.id,
      expectedVersion: 3,
      scheduledAt: AT,
      typedCount: 312,
    });
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/dashboard/communications"],
      ["/dashboard/communications/7"],
    ]);
  });

  it("reads an instant written with another precision as the same one", async () => {
    await scheduleComunicadoAction({
      ...SCHEDULE,
      scheduledAt: "2026-10-31T13:00:00Z",
    });
    expect(mocks.schedule.mock.calls[0]![0].scheduledAt).toEqual(AT);
  });

  it("toasts the time the schedule kept", async () => {
    mocks.schedule.mockResolvedValue({
      ok: true,
      version: 4,
      scheduledAt: new Date("2026-11-01T02:30:00.000Z"),
    });
    expect(await scheduleComunicadoAction(SCHEDULE)).toEqual({
      success: true,
      message: "Quedó programado para el sáb, 31 oct, 10:30 PM.",
    });
  });

  it("answers anything unexpected as a failure, logged by its type", async () => {
    const failure = new Error("connect ECONNREFUSED ana@example.test");
    mocks.schedule.mockRejectedValue(failure);

    expect(await scheduleComunicadoAction(SCHEDULE)).toEqual({
      success: false,
      code: "FAILED",
      message: "No pudimos programarlo. Intentá de nuevo en unos minutos.",
    });
    expect(mocks.logFailure).toHaveBeenCalledWith(
      "[comunicados] schedule failed",
      failure,
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("rescheduleComunicadoAction", () => {
  it("moves it as the acting admin, and refreshes the list and the page", async () => {
    expect(await rescheduleComunicadoAction(RESCHEDULE)).toEqual({
      success: true,
      message: "Ahora sale el sáb, 31 oct, 9:00 AM.",
    });
    expect(mocks.reschedule).toHaveBeenCalledWith({
      comunicadoId: 7,
      by: ADMIN.id,
      expectedVersion: 4,
      scheduledAt: AT,
    });
    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/dashboard/communications"],
      ["/dashboard/communications/7"],
    ]);
  });

  it("answers anything unexpected as a failure, logged by its type", async () => {
    const failure = new TypeError("boom");
    mocks.reschedule.mockRejectedValue(failure);

    expect(await rescheduleComunicadoAction(RESCHEDULE)).toEqual({
      success: false,
      code: "FAILED",
      message: "No pudimos programarlo. Intentá de nuevo en unos minutos.",
    });
    expect(mocks.logFailure).toHaveBeenCalledWith(
      "[comunicados] reschedule failed",
      failure,
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe.each([
  [
    "scheduleComunicadoAction",
    scheduleComunicadoAction,
    mocks.schedule,
    SCHEDULE,
  ],
  [
    "rescheduleComunicadoAction",
    rescheduleComunicadoAction,
    mocks.reschedule,
    RESCHEDULE,
  ],
] as const)("%s's refusals", (_name, action, service, input) => {
  it.each(REFUSAL_CODES)(
    "answers %s with its code and message, refreshing nothing",
    async (code) => {
      service.mockResolvedValue({
        ok: false,
        code,
        message: `Mensaje de ${code}.`,
      });

      expect(await action(input)).toEqual({
        success: false,
        code,
        message: `Mensaje de ${code}.`,
      });
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(mocks.logFailure).not.toHaveBeenCalled();
    },
  );
});

describe("cancelComunicadoScheduleAction", () => {
  it("cancels as the acting admin, and refreshes the list and the page", async () => {
    expect(await cancelComunicadoScheduleAction({ comunicadoId: 7 })).toEqual({
      success: true,
      message: "Cancelamos la programación: quedó como borrador.",
    });
    expect(mocks.cancel).toHaveBeenCalledWith({
      comunicadoId: 7,
      by: ADMIN.id,
    });
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/dashboard/communications"],
      ["/dashboard/communications/7"],
    ]);
  });

  it("answers one already back to a draft as done", async () => {
    mocks.cancel.mockResolvedValue({
      ok: true,
      version: 6,
      alreadyDraft: true,
    });

    expect(await cancelComunicadoScheduleAction({ comunicadoId: 7 })).toEqual({
      success: true,
      message: "Ya no estaba programado: es un borrador.",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2);
  });

  it.each(["NOT_FOUND", "NOT_SCHEDULED"] as const)(
    "answers %s with its code and message, refreshing nothing",
    async (code) => {
      mocks.cancel.mockResolvedValue({
        ok: false,
        code,
        message: `Mensaje de ${code}.`,
      });

      expect(await cancelComunicadoScheduleAction({ comunicadoId: 7 })).toEqual(
        { success: false, code, message: `Mensaje de ${code}.` },
      );
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("answers anything unexpected as a failure, logged by its type", async () => {
    const failure = new Error("timeout");
    mocks.cancel.mockRejectedValue(failure);

    expect(await cancelComunicadoScheduleAction({ comunicadoId: 7 })).toEqual({
      success: false,
      code: "FAILED",
      message: "No pudimos cancelar la programación. Probá de nuevo.",
    });
    expect(mocks.logFailure).toHaveBeenCalledWith(
      "[comunicados] cancel schedule failed",
      failure,
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
