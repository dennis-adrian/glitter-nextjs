import { fn } from "storybook/test";

import type { DiscountCodeUser } from "@/app/lib/discount_codes/definitions";

// Storybook-only substitutes: the picker's stories never call the database.
const avatar = "/img/placeholders/avatar-placeholder.png";

export const STORY_USERS: DiscountCodeUser[] = [
  { id: 1, displayName: "Adrian Guzman", email: "adrian@example.test" },
  { id: 2, displayName: "Abyonic", email: "abyonic@example.test" },
  { id: 3, displayName: "Pulpollo", email: "pulpollo@example.test" },
  { id: 4, displayName: "Pandas Draw", email: "pandas@example.test" },
  { id: 5, displayName: "Ana Cheese", email: "ana.cheese@example.test" },
  { id: 6, displayName: "Carla Cheeseman", email: "carla@example.test" },
  { id: 7, displayName: "Andrés Cheesa", email: "andres@example.test" },
].map((user) => ({
  firstName: null,
  lastName: null,
  imageUrl: avatar,
  ...user,
}));

export const searchDiscountCodeUsers = fn(async (query: unknown) => {
  const term = String(query).trim().toLowerCase();
  if (term.length < 2) return [];
  return STORY_USERS.filter((user) =>
    `${user.displayName} ${user.email}`.toLowerCase().includes(term),
  );
});

export const fetchDiscountCodes = fn(async () => []);
export const fetchDiscountCode = fn(async () => null);
export const createDiscountCode = fn(async () => ({
  success: true,
  message: "Código de descuento creado (demo)",
}));
export const updateDiscountCode = fn(async () => ({
  success: true,
  message: "Código de descuento actualizado (demo)",
}));
export const setDiscountCodeActive = fn(async () => ({
  success: true,
  message: "Código de descuento actualizado (demo)",
}));
export const validateAndApplyDiscountCode = fn(async () => ({
  success: false,
  message: "Código de descuento inválido o inactivo.",
}));
