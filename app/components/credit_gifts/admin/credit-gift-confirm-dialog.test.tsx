// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CreditGiftConfirmDialog from "@/app/components/credit_gifts/admin/credit-gift-confirm-dialog";

function open(total: number, onConfirm = vi.fn()) {
  render(
    <CreditGiftConfirmDialog
      open
      onOpenChange={vi.fn()}
      eligibleCount={total / 20}
      skippedCount={2}
      amountPerRecipient={20}
      total={total}
      isPending={false}
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

describe("CreditGiftConfirmDialog", () => {
  afterEach(cleanup);

  it("restates who gets what before anything moves", () => {
    open(700);
    expect(screen.getByText("¿Regalar 700 créditos?")).toBeTruthy();
    expect(screen.getByText("35")).toBeTruthy();
    expect(screen.getByText("En la app y por correo")).toBeTruthy();
  });

  it("confirms a small gift with one click", () => {
    const onConfirm = open(700);
    fireEvent.click(
      screen.getByRole("button", { name: "Regalar 700 créditos" }),
    );
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it("makes the admin type a large total first", () => {
    const onConfirm = open(1000);
    const confirm = screen.getByRole("button", {
      name: "Regalar 1000 créditos",
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/para confirmar/), {
      target: { value: "100" },
    });
    expect(confirm.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/para confirmar/), {
      target: { value: "1000" },
    });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(1000);
  });
});
