import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { OrderWithRelations } from "@/app/lib/orders/definitions";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  updateOrder: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/app/lib/orders/actions", () => ({
  updateOrder: mocks.updateOrder,
}));
vi.mock("@/app/lib/posthog-capture", () => ({
  captureClientEvent: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
import EditOrderForm from "./edit-order-form";

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const product = (name: string) => ({
  name,
  imageUrl: null,
  images: [],
  status: "available",
});

// Two kits of polera + tote + 2 stickers. The stickers' units were allocated
// 834 and 833 cents, so that component spans two order lines.
const lines = [
  { id: 11, productId: 1, name: "Polera", label: "Talla: M", cents: 8333 },
  { id: 12, productId: 2, name: "Tote", label: null, cents: 5000 },
  { id: 13, productId: 3, name: "Stickers", label: null, cents: 834 },
  { id: 14, productId: 3, name: "Stickers", label: null, cents: 833 },
];

const order = {
  id: 42,
  status: "pending",
  totalAmount: 300,
  revision: 1,
  updatedAt: new Date("2026-09-20T12:00:00Z"),
  orderItems: lines.map((line) => ({
    id: line.id,
    productId: line.productId,
    productVariantId: line.label ? 7 : null,
    productVariantLabel: line.label,
    productNameAtPurchase: line.name,
    quantity: 2,
    priceAtPurchase: line.cents / 100,
    product: product(line.name),
    variant: null,
    adjustmentItemId: null,
  })),
  bundles: [
    {
      id: 5,
      nameSnapshot: "Kit Clásicos",
      imageUrlSnapshot: "https://utfs.io/f/kit.png",
      quantity: 2,
      unitPriceCents: 15000,
      separateUnitPriceCents: 18000,
      items: lines.map((line) => ({
        orderItemId: line.id,
        unitsPerBundle: 1,
        paidUnitPriceCents: line.cents,
      })),
    },
  ],
} as unknown as OrderWithRelations;

const perBundle =
  "Cada combo incluye: 1 × Polera (Talla: M), 1 × Tote, 2 × Stickers";

it("lists one bundle's contents, whatever the quantity", () => {
  render(<EditOrderForm order={order} profileId={3} />);
  expect(screen.getByText(perBundle)).toBeTruthy();

  fireEvent.click(
    screen.getByRole("button", { name: "Quitar un combo Kit Clásicos" }),
  );

  expect(screen.getAllByText("Bs150.00").length).toBeGreaterThan(0);
  expect(screen.getByText(perBundle)).toBeTruthy();
});

it("sends the removal and leaves for the orders list once the order is cancelled", async () => {
  mocks.updateOrder.mockResolvedValue({
    success: true,
    wasCancelled: true,
    message: "Quitaste todos los artículos, así que cancelamos tu pedido.",
  });
  render(<EditOrderForm order={order} profileId={3} />);

  fireEvent.click(
    screen.getByRole("button", { name: "Eliminar combo Kit Clásicos" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Sí, cancelar pedido" }),
  );

  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/my_orders"));
  expect(mocks.updateOrder).toHaveBeenCalledWith(
    42,
    3,
    [],
    order.updatedAt.toISOString(),
    [{ orderBundleId: 5, quantity: 0 }],
  );
});
