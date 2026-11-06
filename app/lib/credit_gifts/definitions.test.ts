import { describe, expect, it } from "vitest";

import {
  CREDIT_GIFT_MAX_RECIPIENTS,
  CREDIT_GIFT_OCCASION_TEMPLATES,
  CreateCreditGiftSchema,
  creditGiftSkipReason,
  creditsAgree,
  creditGiftTotal,
  isValidCreditGiftAmount,
  personalizeCreditGiftMessage,
  requiresTypedConfirmation,
} from "@/app/lib/credit_gifts/definitions";

const validInput = {
  recipientIds: [1, 2],
  amountPerRecipient: 20,
  occasion: "thanks",
  title: "Un regalo",
  message: "Hola {nombre}",
  internalNote: "Cortesía",
  idempotencyKey: "44444444-4444-4444-8444-444444444444",
};

describe("personalizeCreditGiftMessage", () => {
  it("fills every placeholder with the name", () => {
    expect(
      personalizeCreditGiftMessage("¡Hola {nombre}! Gracias, {nombre}.", "Ana"),
    ).toBe("¡Hola Ana! Gracias, Ana.");
  });

  it("closes the gap a missing name would leave", () => {
    expect(
      personalizeCreditGiftMessage(
        "¡Gracias por ser parte de Glitter, {nombre}! ¡Hola {nombre}!",
        null,
      ),
    ).toBe("¡Gracias por ser parte de Glitter! ¡Hola!");
    // A sentence that opened with the name still opens in upper case.
    expect(personalizeCreditGiftMessage("{nombre}, te regalamos", "")).toBe(
      "Te regalamos",
    );
  });
});

describe("occasion presets", () => {
  it("leave the greeting and the wallet line to the email", () => {
    // The email opens with "¡Hola …!" and closes with "Ya están en tu
    // billetera"; a preset repeating either reads twice.
    for (const { message } of Object.values(CREDIT_GIFT_OCCASION_TEMPLATES)) {
      expect(message).not.toMatch(/¡Hola/);
      expect(message).not.toMatch(/billetera/);
    }
  });

  it("read well for a participant with no name", () => {
    for (const { message } of Object.values(CREDIT_GIFT_OCCASION_TEMPLATES)) {
      const text = personalizeCreditGiftMessage(message, null);
      expect(text).not.toContain("{nombre}");
      expect(text).not.toMatch(/\s[,.!?]|,[!?.]|^[a-zñáéíóú]/u);
    }
  });
});

describe("creditsAgree", () => {
  it("agrees the verb with one credit or several", () => {
    expect(creditsAgree(1, "Ya está", "Ya están")).toBe("Ya está");
    expect(creditsAgree(20, "Ya está", "Ya están")).toBe("Ya están");
  });
});

describe("gift limits", () => {
  it("accepts amounts up to the per-person cap with two decimals", () => {
    expect(isValidCreditGiftAmount(20)).toBe(true);
    expect(isValidCreditGiftAmount(12.5)).toBe(true);
    expect(isValidCreditGiftAmount(500)).toBe(true);
    expect(isValidCreditGiftAmount(500.01)).toBe(false);
    expect(isValidCreditGiftAmount(0)).toBe(false);
    expect(isValidCreditGiftAmount(1.005)).toBe(false);
  });

  it("asks for the typed total from 1.000 credits on", () => {
    expect(requiresTypedConfirmation(creditGiftTotal(20, 49))).toBe(false);
    expect(requiresTypedConfirmation(creditGiftTotal(20, 50))).toBe(true);
  });

  it("caps recipients and refuses the same person twice", () => {
    expect(CreateCreditGiftSchema.safeParse(validInput).success).toBe(true);
    expect(
      CreateCreditGiftSchema.safeParse({
        ...validInput,
        recipientIds: Array.from(
          { length: CREDIT_GIFT_MAX_RECIPIENTS + 1 },
          (_, index) => index + 1,
        ),
      }).success,
    ).toBe(false);
    expect(
      CreateCreditGiftSchema.safeParse({ ...validInput, recipientIds: [1, 1] })
        .success,
    ).toBe(false);
  });

  it("refuses {nombre} in the title, which everyone gets as written", () => {
    expect(
      CreateCreditGiftSchema.safeParse({
        ...validInput,
        title: "Gracias, {nombre}",
      }).success,
    ).toBe(false);
  });

  it("requires the internal note", () => {
    expect(
      CreateCreditGiftSchema.safeParse({ ...validInput, internalNote: " " })
        .success,
    ).toBe(false);
  });
});

describe("creditGiftSkipReason", () => {
  it("lets in whoever can open a wallet", () => {
    expect(creditGiftSkipReason({ role: "user", status: "verified" })).toBe(
      null,
    );
    expect(creditGiftSkipReason({ role: "user", status: "paused" })).toBe(null);
  });

  it.each([
    [{ role: "admin", status: "verified" }, "not_participant"],
    [{ role: "festival_admin", status: "verified" }, "not_participant"],
    [{ role: "user", status: "pending" }, "not_verified"],
    [{ role: "user", status: "rejected" }, "not_verified"],
    [{ role: "user", status: "banned" }, "banned"],
  ])("skips %o as %s", (recipient, reason) => {
    expect(creditGiftSkipReason(recipient)).toBe(reason);
  });
});
