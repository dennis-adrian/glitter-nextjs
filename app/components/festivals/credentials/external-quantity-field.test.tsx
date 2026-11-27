// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import ExternalQuantityField from "@/app/components/festivals/credentials/external-quantity-field";
import type { CredentialsResult } from "@/app/lib/credentials/definitions";

const setExternalCredentialQuantity = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/credentials/actions", () => ({ setExternalCredentialQuantity }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function field(override: number | null, standCount = 2) {
  return (
    <ExternalQuantityField
      festivalId={1}
      externalParticipantId={7}
      name="Refugio Huellitas"
      override={override}
      defaultQuantity={2 * standCount}
      standCount={standCount}
    />
  );
}

const input = () => screen.getByLabelText("Credenciales para Refugio Huellitas") as HTMLInputElement;

describe("ExternalQuantityField", () => {
  it("follows a new saved total while untouched", () => {
    const { rerender } = render(field(3));
    expect(input().value).toBe("3");
    rerender(field(5));
    expect(input().value).toBe("5");
    rerender(field(null));
    expect(input().value).toBe("");
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("keeps a draft over a newer total and asks to review it before replacing it", async () => {
    setExternalCredentialQuantity.mockResolvedValue({ success: true, message: "ok" });
    const { rerender } = render(field(3));
    fireEvent.change(input(), { target: { value: "6" } });
    rerender(field(4));
    expect(input().value).toBe("6");

    fireEvent.blur(input());
    expect(setExternalCredentialQuantity).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith(
      expect.stringContaining("cambió a 4"),
      expect.objectContaining({ action: expect.objectContaining({ label: "Usar 4" }) }),
    );
    expect(input().value).toBe("6");
    // Still marked once the warning closes: 6 is not the saved total.
    expect(input().getAttribute("aria-invalid")).toBe("true");

    fireEvent.blur(input());
    await waitFor(() =>
      expect(setExternalCredentialQuantity).toHaveBeenCalledWith({
        festivalId: 1,
        externalParticipantId: 7,
        quantity: 6,
        standCount: 2,
      }),
    );
    expect(setExternalCredentialQuantity).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(input().disabled).toBe(false));
    expect(input().getAttribute("aria-invalid")).toBeNull();
  });

  it("takes the newer total from the warning", () => {
    const { rerender } = render(field(3));
    fireEvent.change(input(), { target: { value: "6" } });
    rerender(field(4));
    fireEvent.blur(input());
    const [, options] = vi.mocked(toast.warning).mock.calls[0]!;
    act(() => (options as { action: { onClick: () => void } }).action.onClick());
    expect(input().value).toBe("4");
    expect(input().getAttribute("aria-invalid")).toBeNull();
    fireEvent.blur(input());
    expect(setExternalCredentialQuantity).not.toHaveBeenCalled();
  });

  it("names the per-stand default when the newer total cleared the override", () => {
    const { rerender } = render(field(3));
    fireEvent.change(input(), { target: { value: "6" } });
    rerender(field(null));
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(setExternalCredentialQuantity).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith(
      expect.stringContaining("cantidad por espacio (4 en total)"),
      expect.objectContaining({ action: expect.objectContaining({ label: "Usar 4" }) }),
    );
  });

  it("does not take its own save, refreshed back, for someone else's", async () => {
    setExternalCredentialQuantity.mockResolvedValue({ success: true, message: "ok" });
    const { rerender } = render(field(3));
    fireEvent.change(input(), { target: { value: "6" } });
    fireEvent.blur(input());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    rerender(field(6));
    expect(input().value).toBe("6");

    fireEvent.change(input(), { target: { value: "8" } });
    fireEvent.blur(input());
    await waitFor(() => expect(setExternalCredentialQuantity).toHaveBeenCalledTimes(2));
    expect(setExternalCredentialQuantity).toHaveBeenLastCalledWith({
      festivalId: 1,
      externalParticipantId: 7,
      quantity: 8,
      standCount: 2,
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("does not flag its own save when the new total lands before the save resolves", async () => {
    let finish!: (result: CredentialsResult) => void;
    setExternalCredentialQuantity.mockReturnValueOnce(
      new Promise<CredentialsResult>((resolve) => (finish = resolve)),
    );
    setExternalCredentialQuantity.mockResolvedValue({ success: true, message: "ok" });
    const { rerender } = render(field(3));
    fireEvent.change(input(), { target: { value: "6" } });
    fireEvent.blur(input());
    await waitFor(() => expect(setExternalCredentialQuantity).toHaveBeenCalledTimes(1));
    // The action's revalidation can deliver the saved total first.
    rerender(field(6));
    finish({ success: true, message: "ok" });
    await waitFor(() => expect(input().disabled).toBe(false));
    expect(input().value).toBe("6");

    fireEvent.change(input(), { target: { value: "8" } });
    fireEvent.blur(input());
    await waitFor(() => expect(setExternalCredentialQuantity).toHaveBeenCalledTimes(2));
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("keeps a newer total that lands while its own save is in flight", async () => {
    let finish!: (result: CredentialsResult) => void;
    setExternalCredentialQuantity.mockReturnValueOnce(
      new Promise<CredentialsResult>((resolve) => (finish = resolve)),
    );
    const { rerender } = render(field(3));
    fireEvent.change(input(), { target: { value: "6" } });
    fireEvent.blur(input());
    await waitFor(() => expect(setExternalCredentialQuantity).toHaveBeenCalledTimes(1));
    // Another admin saved 4 after this save: the later render brings it.
    rerender(field(4));
    finish({ success: true, message: "ok" });
    await waitFor(() => expect(input().disabled).toBe(false));
    rerender(field(4));
    // 4 stays the saved total, so committing 6 again asks for review first.
    fireEvent.blur(input());
    expect(setExternalCredentialQuantity).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledWith(
      expect.stringContaining("cambió a 4"),
      expect.anything(),
    );
  });

  it("keeps a newer total equal to the old one that lands while its own save is in flight", async () => {
    let finish!: (result: CredentialsResult) => void;
    setExternalCredentialQuantity.mockReturnValueOnce(
      new Promise<CredentialsResult>((resolve) => (finish = resolve)),
    );
    const { rerender } = render(field(3));
    fireEvent.change(input(), { target: { value: "6" } });
    fireEvent.blur(input());
    await waitFor(() => expect(setExternalCredentialQuantity).toHaveBeenCalledTimes(1));
    // Another admin saved 4 and then 3 after this save: the server holds 3.
    rerender(field(4));
    rerender(field(3));
    finish({ success: true, message: "ok" });
    await waitFor(() => expect(input().disabled).toBe(false));
    rerender(field(3));
    expect(input().value).toBe("6");
    // 6 is not the saved total, so committing it again asks for review first.
    fireEvent.blur(input());
    expect(setExternalCredentialQuantity).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledWith(
      expect.stringContaining("cambió a 3"),
      expect.objectContaining({ action: expect.objectContaining({ label: "Usar 3" }) }),
    );
    expect(input().getAttribute("aria-invalid")).toBe("true");
  });

  it("goes back to the current saved total when a save is refused", async () => {
    let finish!: (result: CredentialsResult) => void;
    setExternalCredentialQuantity.mockReturnValue(
      new Promise<CredentialsResult>((resolve) => (finish = resolve)),
    );
    const { rerender } = render(field(3));
    fireEvent.change(input(), { target: { value: "6" } });
    fireEvent.blur(input());
    await waitFor(() => expect(setExternalCredentialQuantity).toHaveBeenCalledTimes(1));
    rerender(field(4));
    finish({ success: false, message: "No se pudo." });
    await waitFor(() => expect(input().value).toBe("4"));
    expect(toast.error).toHaveBeenCalledWith("No se pudo.");
  });

  it("keeps the draft, marked, when the stands changed under it, and saves it after a refresh", async () => {
    setExternalCredentialQuantity.mockResolvedValueOnce({
      success: false,
      message: "Cambió la cantidad de espacios de Refugio Huellitas mientras editabas.",
      standsChanged: true,
    });
    setExternalCredentialQuantity.mockResolvedValue({ success: true, message: "ok" });
    const { rerender } = render(field(3));
    fireEvent.change(input(), { target: { value: "6" } });
    fireEvent.blur(input());
    await waitFor(() => expect(setExternalCredentialQuantity).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(input().disabled).toBe(false));
    expect(toast.error).toHaveBeenCalledWith(
      "Cambió la cantidad de espacios de Refugio Huellitas mientras editabas.",
    );
    expect(input().value).toBe("6");
    expect(input().getAttribute("aria-invalid")).toBe("true");

    // The refresh brings 3 stands; the same total is sent against them.
    rerender(field(3, 3));
    expect(input().value).toBe("6");
    fireEvent.blur(input());
    await waitFor(() => expect(setExternalCredentialQuantity).toHaveBeenCalledTimes(2));
    expect(setExternalCredentialQuantity).toHaveBeenLastCalledWith({
      festivalId: 1,
      externalParticipantId: 7,
      quantity: 6,
      standCount: 3,
    });
    await waitFor(() => expect(input().getAttribute("aria-invalid")).toBeNull());
  });

  it("sends the stand count a draft was typed against, not one a refresh brought", async () => {
    setExternalCredentialQuantity.mockResolvedValueOnce({
      success: false,
      message: "Cambió la cantidad de espacios de Refugio Huellitas mientras editabas.",
      standsChanged: true,
    });
    setExternalCredentialQuantity.mockResolvedValue({ success: true, message: "ok" });
    const { rerender } = render(field(null, 1));
    fireEvent.change(input(), { target: { value: "1" } });
    rerender(field(null, 2));
    expect(input().value).toBe("1");
    fireEvent.blur(input());
    await waitFor(() => expect(setExternalCredentialQuantity).toHaveBeenCalledTimes(1));
    expect(setExternalCredentialQuantity).toHaveBeenCalledWith({
      festivalId: 1,
      externalParticipantId: 7,
      quantity: 1,
      standCount: 1,
    });
    await waitFor(() => expect(input().disabled).toBe(false));
    expect(toast.error).toHaveBeenCalledWith(
      "Cambió la cantidad de espacios de Refugio Huellitas mientras editabas.",
    );
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(input().value).toBe("1");
    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(input().className).toContain("border-amber-500");

    // Warned, the admin confirms the same total against the count shown.
    rerender(field(null, 2));
    fireEvent.blur(input());
    await waitFor(() => expect(setExternalCredentialQuantity).toHaveBeenCalledTimes(2));
    expect(setExternalCredentialQuantity).toHaveBeenLastCalledWith({
      festivalId: 1,
      externalParticipantId: 7,
      quantity: 1,
      standCount: 2,
    });
    await waitFor(() => expect(input().getAttribute("aria-invalid")).toBeNull());
  });

  it("does not move a draft's stand count before a refusal", async () => {
    setExternalCredentialQuantity.mockResolvedValue({ success: true, message: "ok" });
    const { rerender } = render(field(3, 2));
    fireEvent.change(input(), { target: { value: "6" } });
    rerender(field(3, 3));
    rerender(field(3, 4));
    fireEvent.keyDown(input(), { key: "Enter" });
    await waitFor(() =>
      expect(setExternalCredentialQuantity).toHaveBeenCalledWith({
        festivalId: 1,
        externalParticipantId: 7,
        quantity: 6,
        standCount: 2,
      }),
    );
  });

  it("waits for the refreshed count after a refusal that arrives first", async () => {
    // The realistic order: the refusal lands while the prop still shows the
    // old count, and router.refresh brings the new one afterwards.
    setExternalCredentialQuantity.mockResolvedValueOnce({
      success: false,
      message: "Cambió la cantidad de espacios.",
      standsChanged: true,
    });
    setExternalCredentialQuantity.mockResolvedValue({ success: true, message: "ok" });
    const { rerender } = render(field(3, 1));
    fireEvent.change(input(), { target: { value: "6" } });
    fireEvent.blur(input());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(input().disabled).toBe(false));
    rerender(field(3, 1));
    rerender(field(3, 3));
    fireEvent.blur(input());
    await waitFor(() => expect(setExternalCredentialQuantity).toHaveBeenCalledTimes(2));
    expect(setExternalCredentialQuantity).toHaveBeenLastCalledWith({
      festivalId: 1,
      externalParticipantId: 7,
      quantity: 6,
      standCount: 3,
    });
  });

  it("follows the stand count while untouched and sends the current one", async () => {
    setExternalCredentialQuantity.mockResolvedValue({ success: true, message: "ok" });
    const { rerender } = render(field(3, 1));
    rerender(field(3, 3));
    fireEvent.change(input(), { target: { value: "6" } });
    fireEvent.blur(input());
    await waitFor(() =>
      expect(setExternalCredentialQuantity).toHaveBeenCalledWith({
        festivalId: 1,
        externalParticipantId: 7,
        quantity: 6,
        standCount: 3,
      }),
    );
  });

  it("clears without a stand count after the stands changed under the draft", async () => {
    setExternalCredentialQuantity.mockResolvedValue({ success: true, message: "ok" });
    const { rerender } = render(field(3, 1));
    fireEvent.change(input(), { target: { value: "" } });
    rerender(field(3, 2));
    fireEvent.blur(input());
    await waitFor(() =>
      expect(setExternalCredentialQuantity).toHaveBeenCalledWith({
        festivalId: 1,
        externalParticipantId: 7,
        quantity: null,
      }),
    );
  });

  it("clears without a stand count", async () => {
    setExternalCredentialQuantity.mockResolvedValue({ success: true, message: "ok" });
    render(field(3));
    fireEvent.change(input(), { target: { value: "" } });
    fireEvent.blur(input());
    await waitFor(() =>
      expect(setExternalCredentialQuantity).toHaveBeenCalledWith({
        festivalId: 1,
        externalParticipantId: 7,
        quantity: null,
      }),
    );
  });

  it("goes back to the current saved total after an invalid number", () => {
    const { rerender } = render(field(3));
    rerender(field(4));
    fireEvent.change(input(), { target: { value: "-1" } });
    fireEvent.blur(input());
    expect(setExternalCredentialQuantity).not.toHaveBeenCalled();
    expect(input().value).toBe("4");
  });
});
