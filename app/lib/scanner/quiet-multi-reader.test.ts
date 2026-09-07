import type { BinaryBitmap, Reader, Result } from "@zxing/library";
import { describe, expect, it, vi } from "vitest";

import QuietMultiReader from "@/app/lib/scanner/quiet-multi-reader";

/** Stand-ins for ZXing's types: this class only ever passes them through. */
const image = {} as BinaryBitmap;
const hit = { text: "GLT-0012" } as unknown as Result;

function readerThatFinds(result: Result): Reader {
  return { decode: vi.fn(() => result), reset: vi.fn() };
}

function readerThatMisses(error: Error = new Error("not this one")): Reader {
  return {
    decode: vi.fn(() => {
      throw error;
    }),
    reset: vi.fn(),
  };
}

class FakeNotFound extends Error {}

const notFound = () => new FakeNotFound();

describe("QuietMultiReader", () => {
  it("returns the first reader's result", () => {
    const reader = readerThatFinds(hit);

    expect(new QuietMultiReader([reader], notFound).decode(image)).toBe(hit);
  });

  it("falls through a reader that does not match", () => {
    const miss = readerThatMisses();
    const found = readerThatFinds(hit);

    expect(new QuietMultiReader([miss, found], notFound).decode(image)).toBe(
      hit,
    );
    expect(miss.decode).toHaveBeenCalledOnce();
  });

  it("stops at the first match", () => {
    const found = readerThatFinds(hit);
    const later = readerThatFinds(hit);

    new QuietMultiReader([found, later], notFound).decode(image);

    expect(later.decode).not.toHaveBeenCalled();
  });

  it("forwards the image and hints to each reader", () => {
    const reader = readerThatFinds(hit);
    const hints = new Map();

    new QuietMultiReader([reader], notFound).decode(image, hints);

    expect(reader.decode).toHaveBeenCalledWith(image, hints);
  });

  /**
   * The contract that keeps the camera alive: the browser scan loop retries
   * only on the library's `NotFoundException` and treats anything else as fatal
   * to the session, so a frame with no code has to surface exactly that class.
   */
  it("throws what notFound builds when every reader misses", () => {
    const scanner = new QuietMultiReader(
      [readerThatMisses(), readerThatMisses()],
      notFound,
    );

    expect(() => scanner.decode(image)).toThrow(FakeNotFound);
  });

  it("reports not found rather than leaking a reader's own error", () => {
    const boom = new TypeError("a bug inside a reader");
    const scanner = new QuietMultiReader([readerThatMisses(boom)], notFound);

    expect(() => scanner.decode(image)).toThrow(FakeNotFound);
    expect(() => scanner.decode(image)).not.toThrow(TypeError);
  });

  it("reports not found when configured with no readers", () => {
    expect(() => new QuietMultiReader([], notFound).decode(image)).toThrow(
      FakeNotFound,
    );
  });

  it("resets every reader", () => {
    const first = readerThatFinds(hit);
    const second = readerThatFinds(hit);

    new QuietMultiReader([first, second], notFound).reset();

    expect(first.reset).toHaveBeenCalledOnce();
    expect(second.reset).toHaveBeenCalledOnce();
  });
});
