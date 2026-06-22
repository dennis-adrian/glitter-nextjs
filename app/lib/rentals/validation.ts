import type {
  ProductContentSectionDisplayContext,
  ProductContentSectionFormat,
  ProductContentSectionInput,
  RentalContentSectionSnapshot,
} from "@/app/lib/rentals/types";
import type { BaseProductContentSection } from "@/app/lib/products/definitions";
import {
  productContentSectionDisplayContextEnum,
  productContentSectionFormatEnum,
} from "@/db/schema";

export function validateProductContentSection(
  section: ProductContentSectionInput,
): string | null {
  if (
    !productContentSectionFormatEnum.enumValues.includes(section.format)
  ) {
    return "El formato de la sección no es válido.";
  }

  if (
    !productContentSectionDisplayContextEnum.enumValues.includes(
      section.displayContext,
    )
  ) {
    return "El contexto de visualización no es válido.";
  }

  if (!section.title.trim()) {
    return "El título de la sección es requerido.";
  }

  if (section.format === "free_text") {
    if (!section.body?.trim()) {
      return "Las secciones de texto libre requieren contenido.";
    }
    return null;
  }

  const items = (section.items ?? []).map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) {
    return "Las listas deben tener al menos un elemento.";
  }

  return null;
}

export function normalizeProductContentSectionItems(
  items: string[] | null | undefined,
): string[] {
  return (items ?? []).map((item) => item.trim()).filter(Boolean);
}

export function filterContentSectionsForMode(
  sections: BaseProductContentSection[],
  mode: "purchase" | "rental",
  variantId: number | null,
): BaseProductContentSection[] {
  return sections
    .filter((section) => section.isVisible)
    .filter((section) => {
      if (section.displayContext === "all") return true;
      if (mode === "purchase") return section.displayContext === "purchase";
      return section.displayContext === "rental";
    })
    .filter((section) => {
      if (section.productVariantId == null) return true;
      return variantId != null && section.productVariantId === variantId;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

export function buildRentalContentSectionsSnapshot(
  sections: BaseProductContentSection[],
): RentalContentSectionSnapshot[] {
  return sections.map((section) => ({
    title: section.title,
    format: section.format as ProductContentSectionFormat,
    body: section.body,
    items: section.items,
    displayContext:
      section.displayContext as ProductContentSectionDisplayContext,
    sortOrder: section.sortOrder,
  }));
}

export function validateProductRentalSettings(input: {
  isPurchasable: boolean;
  isRentable: boolean;
  rentalPrice?: number | null;
  rentalStockMode?: "shared" | "separate";
  rentalStock?: number | null;
  hasVariants: boolean;
  variantRentalStocks?: Array<number | null | undefined>;
}): string | null {
  if (!input.isPurchasable && !input.isRentable) {
    return "El producto debe estar disponible para compra, alquiler o ambos.";
  }

  if (!input.isRentable) return null;

  if (
    input.rentalPrice == null ||
    !Number.isFinite(input.rentalPrice) ||
    input.rentalPrice < 0
  ) {
    return "El precio de alquiler es requerido para productos alquilables.";
  }

  if (input.rentalStockMode === "separate") {
    if (input.hasVariants) {
      const variantRentalStocks = input.variantRentalStocks ?? [];
      if (
        variantRentalStocks.length === 0 ||
        variantRentalStocks.some(
          (stock) => stock == null || !Number.isFinite(stock) || stock < 0,
        )
      ) {
        return "Cada variante alquilable necesita stock de alquiler.";
      }
    } else if (
      input.rentalStock == null ||
      !Number.isFinite(input.rentalStock) ||
      input.rentalStock < 0
    ) {
      return "El stock de alquiler es requerido cuando se usa stock separado.";
    }
  }

  return null;
}
