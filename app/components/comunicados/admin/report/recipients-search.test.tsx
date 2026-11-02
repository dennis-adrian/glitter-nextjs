// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RecipientsSearch from "@/app/components/comunicados/admin/report/recipients-search";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

describe("RecipientsSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    replace.mockReset();
  });

  it("writes the search a moment after the last keystroke, keeping the chip and dropping the page", () => {
    render(<RecipientsSearch comunicadoId={7} filter="unread" query="" />);
    const input = screen.getByRole("searchbox", {
      name: "Buscar por nombre o correo",
    });

    fireEvent.change(input, { target: { value: "an" } });
    act(() => vi.advanceTimersByTime(300));
    fireEvent.change(input, { target: { value: "ana" } });
    act(() => vi.advanceTimersByTime(399));
    expect(replace).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(
      "/dashboard/communications/7?filter=unread&q=ana",
      { scroll: false },
    );
  });

  it("starts from the search in the URL, and clearing it drops `q`", () => {
    render(<RecipientsSearch comunicadoId={7} filter="all" query="ana" />);
    const input = screen.getByRole<HTMLInputElement>("searchbox");
    expect(input.value).toBe("ana");

    fireEvent.change(input, { target: { value: "" } });
    act(() => vi.advanceTimersByTime(400));
    expect(replace).toHaveBeenCalledWith("/dashboard/communications/7", {
      scroll: false,
    });
  });
});
