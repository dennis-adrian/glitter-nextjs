import { describe, expect, it } from "vitest";

import { getTicketCode, parseTicketNumber } from "@/app/lib/tickets/utils";

describe("parseTicketNumber", () => {
  it("reads the number out of a festival ticket code", () => {
    expect(parseTicketNumber("GLT-0012")).toBe(12);
  });

  it("accepts a bare number, which is what people read aloud", () => {
    expect(parseTicketNumber("12")).toBe(12);
  });

  it("accepts a slash separator", () => {
    expect(parseTicketNumber("GLT/0012")).toBe(12);
  });

  it("ignores surrounding whitespace", () => {
    expect(parseTicketNumber("  GLT-0012 ")).toBe(12);
  });

  it("round-trips whatever getTicketCode produced", () => {
    expect(parseTicketNumber(getTicketCode("GLT", 4231))).toBe(4231);
  });

  /**
   * The case the camera introduced: a decoded barcode is whatever was printed
   * on the paper. Before this returned null, `Number("")` made a truncated code
   * look like a request to verify ticket zero.
   */
  it("rejects a code whose number is missing", () => {
    expect(parseTicketNumber("GLT-")).toBeNull();
  });

  it("rejects a scanned URL", () => {
    expect(
      parseTicketNumber("https://productoraglitter.com/tickets"),
    ).toBeNull();
  });

  it("rejects a non-numeric code", () => {
    expect(parseTicketNumber("GLT-ABCD")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(parseTicketNumber("")).toBeNull();
  });

  it("rejects zero, which is never a real ticket", () => {
    expect(parseTicketNumber("0")).toBeNull();
    expect(parseTicketNumber("GLT-0000")).toBeNull();
  });

  /**
   * Not a negative number: the leading dash is the separator, so this is a code
   * with an empty festival prefix. Worth pinning down, because reading it the
   * other way would argue for a guard that rejects legitimate codes.
   */
  it("treats a leading dash as the separator", () => {
    expect(parseTicketNumber("-5")).toBe(5);
  });

  it("rejects a fractional number", () => {
    expect(parseTicketNumber("12.5")).toBeNull();
  });
});
