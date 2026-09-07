import { describe, expect, it } from "vitest";

import {
  RESERVATION_ERROR_MESSAGES,
} from "@/app/lib/reservations/errors";

const FORBIDDEN_IMPERATIVES = [
  /\bElige\b/,
  /\bSelecciona\b/,
  /\bPuedes\b/,
  /\bTienes\b/,
  /\bHaz\b/,
  /\bConfirma\b/,
  /\bVuelve\b/,
  /\bIntenta\b/,
  /\bRecarga\b/,
  /\bContacta\b/,
  /\bBusca\b/,
  /\bCancela\b/,
];

describe("reservation error copy voseo", () => {
  it("does not use tú imperatives in participant-facing messages", () => {
    for (const [code, message] of Object.entries(RESERVATION_ERROR_MESSAGES)) {
      for (const pattern of FORBIDDEN_IMPERATIVES) {
        expect(message, `${code} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
