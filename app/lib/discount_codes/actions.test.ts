import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const consumeActionRateLimitMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
    transaction: transactionMock,
    query: {
      discountCodes: { findMany: vi.fn(), findFirst: vi.fn() },
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/app/lib/rate-limit", () => ({
  consumeActionRateLimit: consumeActionRateLimitMock,
}));

vi.mock("@/app/lib/reservations/locks", () => ({
  lockFestivalRow: vi.fn(),
  lockFestivalTermsDocument: vi.fn(),
  lockCreditAccountRows: vi.fn(),
  lockParticipantEligibilityRows: vi.fn(),
  lockParticipants: vi.fn(),
  lockStandRows: vi.fn(),
}));

import {
  createDiscountCode,
  fetchDiscountCodes,
  updateDiscountCode,
  validateAndApplyDiscountCode,
} from "@/app/lib/discount_codes/actions";
import {
  lockFestivalRow,
  lockFestivalTermsDocument,
  lockCreditAccountRows,
  lockParticipantEligibilityRows,
  lockParticipants,
  lockStandRows,
} from "@/app/lib/reservations/locks";

function selectChain(rows: unknown[]) {
  const thenable = Object.assign(Promise.resolve(rows), {
    limit: vi.fn(() =>
      Object.assign(Promise.resolve(rows), {
        for: vi.fn().mockResolvedValue(rows),
      }),
    ),
  });
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => thenable),
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => thenable),
      })),
    })),
  };
}

describe("discount code admin authorization", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
  });

  it("rejects festival_admin create and list", async () => {
    currentProfileMock.mockResolvedValue({ id: 2, role: "festival_admin" });
    await expect(
      createDiscountCode({
        code: "FREE",
        discountUnit: "percentage",
        discountValue: 100,
        expiresAt: new Date("2027-01-01"),
      } as never),
    ).resolves.toMatchObject({ success: false });
    await expect(fetchDiscountCodes()).resolves.toEqual([]);
  });

  it("rejects unauthenticated create", async () => {
    currentProfileMock.mockResolvedValue(null);
    await expect(
      createDiscountCode({
        code: "FREE",
        discountUnit: "percentage",
        discountValue: 100,
        expiresAt: new Date("2027-01-01"),
      } as never),
    ).resolves.toMatchObject({ success: false });
  });
});

describe("validateAndApplyDiscountCode lock order", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    consumeActionRateLimitMock.mockReset();
    vi.mocked(lockFestivalRow).mockReset();
    vi.mocked(lockFestivalTermsDocument).mockReset();
    vi.mocked(lockCreditAccountRows).mockReset();
    vi.mocked(lockParticipantEligibilityRows).mockReset();
    vi.mocked(lockParticipants).mockReset();
    vi.mocked(lockStandRows).mockReset();
    consumeActionRateLimitMock.mockResolvedValue(true);
  });

  it("locks participant, festival, eligibility rows, then stand before the invoice", async () => {
    currentProfileMock.mockResolvedValue({ id: 5, role: "user" });
    const order: string[] = [];
    vi.mocked(lockParticipants).mockImplementation(async () => {
      order.push("participants");
    });
    vi.mocked(lockFestivalRow).mockImplementation(async () => {
      order.push("festival");
      return null;
    });
    vi.mocked(lockFestivalTermsDocument).mockImplementation(async () => {
      order.push("terms");
    });
    vi.mocked(lockParticipantEligibilityRows).mockImplementation(async () => {
      order.push("eligibilityRows");
    });
    vi.mocked(lockCreditAccountRows).mockImplementation(async () => {
      order.push("creditAccount");
      return [5];
    });
    vi.mocked(lockStandRows).mockImplementation(async () => {
      order.push("stand");
      return [];
    });

    const invoicePreview = {
      id: 10,
      userId: 5,
      festivalId: 3,
      standId: 8,
    };
    const select = vi
      .fn()
      .mockImplementationOnce(() => selectChain([invoicePreview]))
      .mockImplementationOnce(() => selectChain([]));
    const tx = { select };
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await validateAndApplyDiscountCode({
      code: "SAVE10",
      invoiceId: 10,
    });

    expect(result).toMatchObject({ success: false });
    expect(order).toEqual([
      "participants",
      "festival",
      "terms",
      "eligibilityRows",
      "creditAccount",
      "stand",
    ]);
    expect(lockParticipants).toHaveBeenCalledWith(tx, 3, [5]);
    expect(lockFestivalRow).toHaveBeenCalledWith(tx, 3);
    expect(lockParticipantEligibilityRows).toHaveBeenCalledWith(tx, 3, [5]);
    expect(lockCreditAccountRows).toHaveBeenCalledWith(tx, [5]);
    expect(lockStandRows).toHaveBeenCalledWith(tx, [8]);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("refuses another participant's invoice before taking any lock", async () => {
    currentProfileMock.mockResolvedValue({ id: 6, role: "user" });
    const select = vi
      .fn()
      .mockImplementationOnce(() =>
        selectChain([{ id: 10, userId: 5, festivalId: 3, standId: 8 }]),
      );
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback({ select }),
    );

    const result = await validateAndApplyDiscountCode({
      code: "SAVE10",
      invoiceId: 10,
    });

    expect(result).toEqual({
      success: false,
      message: "Código de descuento inválido o inactivo.",
    });
    expect(lockParticipants).not.toHaveBeenCalled();
    expect(lockFestivalRow).not.toHaveBeenCalled();
    expect(lockStandRows).not.toHaveBeenCalled();
    expect(select).toHaveBeenCalledTimes(1);
  });
});

/** A query builder that resolves to `rows` however it is chained. */
function chain(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  for (const method of ["from", "where", "innerJoin", "limit", "for"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (
    resolve: (value: unknown) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(rows).then(resolve, reject);
  return builder;
}

describe("discount code admin validation", () => {
  const validInput = {
    code: "VIP2026",
    discountUnit: "percentage" as const,
    discountValue: 10,
    maxUses: null,
    festivalId: null,
    audience: "everyone" as const,
    userIds: [],
    expiresAt: new Date(Date.now() + 86_400_000),
    isActive: true,
  };

  beforeEach(() => {
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
  });

  it.each([
    [
      "a reserved code with nobody on it",
      { audience: "selected_users" as const, userIds: [] },
      "Elegí al menos un usuario.",
    ],
    [
      "a percentage above 100",
      { discountValue: 150 },
      "Un porcentaje no puede superar el 100%.",
    ],
    [
      "a code participants could not type",
      { code: "VIP 2026" },
      "Usá solo letras, números, guiones o guiones bajos en el código.",
    ],
    [
      "a code that has already expired",
      { expiresAt: new Date(Date.now() - 1000) },
      "La fecha de vencimiento tiene que ser futura.",
    ],
    [
      "a code longer than participants can apply",
      { code: "A".repeat(65) },
      "Datos de código inválidos.",
    ],
  ])("refuses %s before writing anything", async (_label, patch, message) => {
    await expect(
      createDiscountCode({ ...validInput, ...patch }),
    ).resolves.toEqual({ success: false, message });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("refuses a limit below the uses a code already has", async () => {
    const update = vi.fn();
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) =>
        callback({
          select: vi.fn(() => chain([{ code: "vip2026", currentUses: 6 }])),
          update,
        }),
    );

    await expect(
      updateDiscountCode(3, { ...validInput, maxUses: 5 }),
    ).resolves.toEqual({
      success: false,
      message:
        "El límite de usos no puede ser menor a los 6 usos que ya tiene.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("lets a legacy code stored in another case keep a name the format refuses", async () => {
    const update = vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    }));
    const remove = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) =>
        callback({
          select: vi.fn(() => chain([{ code: "VIP 2026", currentUses: 0 }])),
          update,
          delete: remove,
        }),
    );

    await expect(
      updateDiscountCode(3, { ...validInput, code: "vip 2026" }),
    ).resolves.toMatchObject({ success: true });
    expect(update).toHaveBeenCalledTimes(1);

    // A real rename is still held to the format.
    await expect(
      updateDiscountCode(3, { ...validInput, code: "other code" }),
    ).resolves.toEqual({
      success: false,
      message:
        "Usá solo letras, números, guiones o guiones bajos en el código.",
    });
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe("validateAndApplyDiscountCode audience", () => {
  const invoiceRow = {
    id: 10,
    originalAmount: 400,
    discountAmount: 0,
    amount: 400,
    discountCodeId: null,
    status: "pending",
    userId: 5,
    festivalId: 3,
  };
  const reservedCode = {
    id: 21,
    code: "vip",
    discountUnit: "percentage",
    discountValue: 25,
    maxUses: null,
    currentUses: 0,
    festivalId: null,
    audience: "selected_users",
    expiresAt: new Date(Date.now() + 86_400_000),
    isActive: true,
  };

  function transactionWith(assignedRows: unknown[]) {
    const update = vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    }));
    const select = vi
      .fn()
      .mockImplementationOnce(() =>
        chain([{ id: 10, userId: 5, festivalId: 3, standId: 8 }]),
      )
      .mockImplementationOnce(() => chain([invoiceRow]))
      .mockImplementationOnce(() => chain([]))
      .mockImplementationOnce(() => chain([reservedCode]))
      .mockImplementationOnce(() => chain(assignedRows));
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) =>
        callback({ select, update }),
    );
    return { select, update };
  }

  beforeEach(() => {
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    consumeActionRateLimitMock.mockReset();
    consumeActionRateLimitMock.mockResolvedValue(true);
  });

  it("refuses a reserved code on the invoice of someone not on its list", async () => {
    currentProfileMock.mockResolvedValue({ id: 5, role: "user" });
    const { select, update } = transactionWith([]);

    await expect(
      validateAndApplyDiscountCode({ code: "VIP", invoiceId: 10 }),
    ).resolves.toEqual({
      success: false,
      message: "Código de descuento inválido o inactivo.",
    });
    expect(select).toHaveBeenCalledTimes(5);
    expect(update).not.toHaveBeenCalled();
  });

  it("applies a reserved code for someone on its list", async () => {
    currentProfileMock.mockResolvedValue({ id: 5, role: "user" });
    const { update } = transactionWith([{ id: 99 }]);

    await expect(
      validateAndApplyDiscountCode({ code: "VIP", invoiceId: 10 }),
    ).resolves.toMatchObject({
      success: true,
      discountAmount: 100,
      newAmount: 300,
    });
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("holds an admin applying on someone's behalf to the owner's place on the list", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    const { update } = transactionWith([]);

    await expect(
      validateAndApplyDiscountCode({ code: "VIP", invoiceId: 10 }),
    ).resolves.toMatchObject({ success: false });
    expect(update).not.toHaveBeenCalled();
  });
});
