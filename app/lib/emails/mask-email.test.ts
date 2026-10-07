import { describe, expect, it } from "vitest";

import { maskEmail } from "@/app/lib/emails/mask-email";

describe("maskEmail", () => {
  it("keeps the first letters and the domain", () => {
    expect(maskEmail("camila.rojas@gmail.com")).toBe("ca••••@gmail.com");
    expect(maskEmail(" ab@x.bo ")).toBe("a••••@x.bo");
  });

  it("hides anything that is not an address", () => {
    expect(maskEmail("not-an-address")).toBe("••••");
    expect(maskEmail("@example.com")).toBe("••••");
  });
});
