import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import FeaturedCollectionCarousel from "./featured-collection-carousel";

const collections = [
  {
    id: 1,
    slug: "clasicos",
    name: "Clásicos",
    description: null,
    imageUrl: null,
    productIds: [1],
  },
  {
    id: 2,
    slug: "alegrias",
    name: "Pequeñas alegrías",
    description: null,
    imageUrl: null,
    productIds: [2],
  },
];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("rotates every eight seconds and stays paused after manual navigation", () => {
  vi.useFakeTimers();
  render(<FeaturedCollectionCarousel collections={collections} />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "Clásicos",
  );

  act(() => vi.advanceTimersByTime(8000));
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "Pequeñas alegrías",
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Ver siguiente colección" }),
  );
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "Clásicos",
  );
  act(() => vi.advanceTimersByTime(16000));
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "Clásicos",
  );

  fireEvent.click(screen.getByRole("button", { name: "Reanudar rotación" }));
  act(() => vi.advanceTimersByTime(8000));
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "Pequeñas alegrías",
  );
});

it("starts paused when reduced motion is requested", () => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  render(<FeaturedCollectionCarousel collections={collections} />);
  expect(
    screen.getByRole("button", { name: "Reanudar rotación" }),
  ).toBeTruthy();
  act(() => vi.advanceTimersByTime(16000));
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "Clásicos",
  );
});
