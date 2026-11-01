import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useCallback } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AppScreenBar,
  ScreenAction,
  ScreenBarProvider,
  ScreenTitle,
  useScreenBack,
} from "@/app/components/navbar/screen-bar";
import type { Screen } from "@/app/components/navbar/screens";

const { pathnameMock, backMock, replaceMock } = vi.hoisted(() => ({
  pathnameMock: vi.fn(),
  backMock: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: pathnameMock,
  useRouter: () => ({ back: backMock, replace: replaceMock }),
}));

const orders: Screen = {
  title: "Pedido",
  parentHref: "/my_orders",
  close: false,
  toParent: false,
};

beforeEach(() => {
  pathnameMock.mockReturnValue("/profiles/3/orders/1043");
  backMock.mockClear();
  replaceMock.mockClear();
  window.sessionStorage.clear();
});

afterEach(cleanup);

function renderBar(bar: Screen = orders, page: React.ReactNode = null) {
  return render(
    <ScreenBarProvider>
      <AppScreenBar screen={bar} />
      {page}
    </ScreenBarProvider>,
  );
}

describe("AppScreenBar", () => {
  it("shows the screen's title and goes to its parent when the app opened here", () => {
    renderBar();

    expect(screen.getByText("Pedido")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(replaceMock).toHaveBeenCalledWith("/my_orders");
    expect(backMock).not.toHaveBeenCalled();
  });

  it("goes back to the previous screen after moving between screens in the app", () => {
    window.sessionStorage.setItem("glitter:in-app-history", "1");
    renderBar();

    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(backMock).toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("goes to the parent anyway after a step that is over", () => {
    window.sessionStorage.setItem("glitter:in-app-history", "1");
    renderBar({ ...orders, toParent: true });

    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(replaceMock).toHaveBeenCalledWith("/my_orders");
  });

  it("closes a flow's first step with an X", () => {
    renderBar({ ...orders, close: true });
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeTruthy();
  });

  it("takes the title, the parent and the action a page gives it", () => {
    renderBar(
      orders,
      <>
        <ScreenTitle title="Pedido #1043" backHref="/my_orders?tab=open" />
        <ScreenAction>
          <button type="button">Carrito</button>
        </ScreenAction>
      </>,
    );

    expect(screen.getByText("Pedido #1043")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Carrito" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(replaceMock).toHaveBeenCalledWith("/my_orders?tab=open");
  });

  it("runs the page's own back instead of leaving", () => {
    const release = vi.fn();
    function HoldPage() {
      const onBack = useCallback(() => release(), []);
      useScreenBack(onBack);
      return null;
    }
    renderBar(orders, <HoldPage />);

    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(release).toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(backMock).not.toHaveBeenCalled();
  });

  it("drops a page's title once that page is gone", () => {
    const { rerender } = renderBar(
      orders,
      <ScreenTitle title="Pedido #1043" />,
    );
    expect(screen.getByText("Pedido #1043")).toBeTruthy();

    act(() => {
      rerender(
        <ScreenBarProvider>
          <AppScreenBar screen={orders} />
        </ScreenBarProvider>,
      );
    });
    expect(screen.queryByText("Pedido #1043")).toBeNull();
    expect(screen.getByText("Pedido")).toBeTruthy();
  });

  it("never shows a title set on another path", () => {
    const { rerender } = renderBar(
      orders,
      <ScreenTitle title="Pedido #1043" />,
    );
    pathnameMock.mockReturnValue("/my_orders");
    rerender(
      <ScreenBarProvider>
        <AppScreenBar screen={{ ...orders, title: "Mis pedidos" }} />
      </ScreenBarProvider>,
    );
    expect(screen.queryByText("Pedido #1043")).toBeNull();
  });
});
