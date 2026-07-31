import { describe, expect, it } from "vitest";

import { isPhoneValid } from "@/app/lib/phone-validator";

describe("isPhoneValid", () => {
  it("accepts Bolivian mobiles the library already knows", () => {
    expect(isPhoneValid("+59170123456")).toBe(true);
    expect(isPhoneValid("+59160123456")).toBe(true);
    expect(isPhoneValid("+59150123456")).toBe(true);
  });

  it("accepts the newly allocated 5-prefixed mobiles", () => {
    // libphonenumber rejects 51–59 as of 3.2.44; the override covers them.
    for (const second of ["1", "2", "3", "4", "5", "6", "7", "8", "9"]) {
      expect(isPhoneValid(`+5915${second}123456`)).toBe(true);
    }
  });

  it("accepts formatting characters around a 5-prefixed number", () => {
    expect(isPhoneValid("+591 51123456")).toBe(true);
    expect(isPhoneValid("+591 5112-3456")).toBe(true);
    expect(isPhoneValid("+591 (5) 1123456")).toBe(true);
  });

  it("accepts Unicode dashes as separators", () => {
    // Pasted from a contact app or a web page, these are not ASCII hyphens.
    expect(isPhoneValid("+591 5112\u20103456")).toBe(true); // hyphen
    expect(isPhoneValid("+591 5112\u20133456")).toBe(true); // en dash
    expect(isPhoneValid("+591 5112\u20143456")).toBe(true); // em dash
    expect(isPhoneValid("+591\u00a05112\u20153456")).toBe(true); // nbsp + horizontal bar
  });

  it("accepts the 00 international prefix", () => {
    expect(isPhoneValid("0059151123456")).toBe(true);
    expect(isPhoneValid("00591 5112-3456")).toBe(true);
  });

  it("rejects letters rather than stripping them", () => {
    // Normalisation removes separators only, so nothing here can be massaged
    // into the overridden range.
    expect(isPhoneValid("+591 5112 3456 ext")).toBe(false);
    expect(isPhoneValid("+591a51123456")).toBe(false);
    expect(isPhoneValid("00591abc51123456")).toBe(false);
  });

  it("accepts Bolivian landlines", () => {
    expect(isPhoneValid("+59122441234")).toBe(true);
  });

  it("still rejects wrong lengths for the overridden range", () => {
    expect(isPhoneValid("+5915112345")).toBe(false); // too short
    expect(isPhoneValid("+591511234567")).toBe(false); // too long
  });

  it("does not loosen validation for other countries", () => {
    // Same digits under a different country code must still be judged by the
    // library, so the override cannot leak past Bolivia.
    expect(isPhoneValid("+15112345678")).toBe(false);
    expect(isPhoneValid("+5451123456")).toBe(false);
    expect(isPhoneValid("not a phone")).toBe(false);
    expect(isPhoneValid("")).toBe(false);
  });
});
