import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

import { toStoredCents } from "@/app/lib/orders/adjustments";

describe("toStoredCents", () => {
  it.each([
    // Float noise from summing prices never adds or loses a cent.
    [19.23 + 15.39 + 2 * 7.69, 5000],
    [-(19.23 + 15.39 + 2 * 7.69), -5000],
    // Half a cent rounds away from zero, as Postgres numeric does.
    [10.625 * 2, 2125],
    [10.625, 1063],
    [-10.625, -1063],
    [99.9 * (1 - 15 / 100), 8492],
    [-(99.9 * (1 - 15 / 100)), -8492],
    // 1.50 at 15% off: `Math.round(1.275 * 100)` gives 127, Postgres 1.28.
    [1.5 * (1 - 15 / 100), 128],
    [-(1.5 * (1 - 15 / 100)), -128],
    // Postgres rounds the text it receives, not the value checkout meant.
    [33.3 * (1 - 15 / 100) * 3, 8491],
    [0, 0],
    [40, 4000],
    [0.004, 0],
    [0.005, 1],
    [1e-7, 0],
  ])("stores %s as %s cents", (amount, cents) => {
    expect(toStoredCents(amount)).toBe(cents);
  });

  it("never returns negative zero", () => {
    expect(Object.is(toStoredCents(-0.001), 0)).toBe(true);
    expect(Object.is(toStoredCents(-1e-9), 0)).toBe(true);
  });

  it("rejects amounts that are not finite", () => {
    expect(() => toStoredCents(Number.NaN)).toThrow(
      "El monto del ajuste es inválido.",
    );
  });
});
