import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ownerOrStaffMock, productsMock, notFoundMock } = vi.hoisted(() => ({
  ownerOrStaffMock: vi.fn(),
  productsMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/app/lib/users/helpers", () => ({
  requireProfileOwnerOrStaff: ownerOrStaffMock,
}));
vi.mock("@/app/lib/participant_products/queries", () => ({
  fetchParticipantProductsByParticipationId: productsMock,
}));
vi.mock(
  "@/app/components/molecules/submitted-products/submitted-product-card",
  () => ({
    default: ({ product }: { product: { id: number } }) => (
      <p>Producto {product.id}</p>
    ),
  }),
);

import SubmittedProductsPage from "./page";

function open(profileId: string, participationId = "7") {
  return SubmittedProductsPage({
    params: Promise.resolve({ profileId, participationId }) as never,
  });
}

beforeEach(() => {
  ownerOrStaffMock.mockReset();
  productsMock.mockReset().mockResolvedValue([{ id: 1 }, { id: 2 }]);
  notFoundMock.mockClear();
});

afterEach(cleanup);

describe("SubmittedProductsPage", () => {
  it("shows the products to their owner or to staff", async () => {
    ownerOrStaffMock.mockResolvedValue({ id: 3, role: "user" });

    render(await open("3"));

    expect(ownerOrStaffMock).toHaveBeenCalledWith(3);
    expect(productsMock).toHaveBeenCalledWith(3, 7);
    expect(screen.getByText("Producto 1")).toBeTruthy();
    expect(screen.getByText("Producto 2")).toBeTruthy();
  });

  it("answers not found to anyone else, without reading the products", async () => {
    ownerOrStaffMock.mockResolvedValue(null);

    await expect(open("3")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(productsMock).not.toHaveBeenCalled();
  });

  it("answers not found to ids that are not numbers", async () => {
    await expect(open("abc")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(ownerOrStaffMock).not.toHaveBeenCalled();
  });
});
