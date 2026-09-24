import { and, eq, inArray } from "drizzle-orm";
import type { db as Database } from "@/db";
import {
  festivals,
  merchBundleCollections,
  merchBundleComponents,
  merchBundleComponentVariants,
  merchBundles,
  merchCollections,
  merchCollectionProducts,
  productImages,
  productOptions,
  productOptionValues,
  products,
  productVariants,
  productVariantOptionValues,
} from "@/db/schema";
import { getDevSeedGate } from "./demo-users";

const fixtures = [
  {
    key: "polera",
    name: "Polera Glitter Club",
    price: 100,
    stock: 0,
    image: "polera",
    variants: true,
    isFeatured: true,
  },
  {
    key: "tote",
    name: "Tote para todos los días",
    price: 60,
    stock: 18,
    image: "tote",
    isFeatured: true,
  },
  {
    key: "stickers",
    name: "Pack de stickers · Pequeñas alegrías",
    price: 25,
    stock: 40,
    image: "stickers",
    status: "sale" as const,
    discount: 20,
  },
  {
    key: "print",
    name: "Print · Nos vemos en Glitter",
    price: 45,
    stock: 0,
    image: "print",
  },
  { key: "pin", name: "Pin Estrellita", price: 30, stock: 3, image: "pin" },
  {
    key: "agenda",
    name: "Agenda de ideas bonitas",
    price: 85,
    stock: 12,
    image: "agenda",
    status: "presale" as const,
  },
  {
    key: "borrador",
    name: "Próximo lanzamiento (demo oculto)",
    price: 50,
    stock: 5,
    image: "pin",
    isVisible: false,
  },
  {
    key: "insumo",
    name: "Exhibidor de muestra",
    price: 40,
    stock: 5,
    image: "print",
    storeCategory: "supplies" as const,
  },
];

/** Inserts missing demo fixtures only; reruns preserve edits, stock and membership. */
export async function seedMerch(database: typeof Database) {
  const gate = getDevSeedGate();
  if (!gate.allowed) throw new Error(gate.reason);
  return database.transaction(async (tx) => {
    const productIds = new Map<string, number>();
    let createdProducts = 0;
    for (const fixture of fixtures) {
      const { key, image, variants, ...fields } = {
        variants: false,
        ...fixture,
      };
      const slug = `demo-merch-${key}`;
      const [created] = await tx
        .insert(products)
        .values({
          ...fields,
          slug,
          description:
            "Producto de demostración para probar la tienda. No es un artículo a la venta real.",
          unitCost: Math.round(fixture.price * 0.4),
          availableDate:
            "status" in fixture && fixture.status === "presale"
              ? new Date(Date.now() + 30 * 86400000)
              : null,
        })
        .onConflictDoNothing({ target: products.slug })
        .returning({ id: products.id });
      if (!created) {
        const [existing] = await tx
          .select({ id: products.id })
          .from(products)
          .where(eq(products.slug, slug));
        productIds.set(key, existing.id);
        continue;
      }
      createdProducts++;
      productIds.set(key, created.id);
      await tx.insert(productImages).values({
        productId: created.id,
        imageUrl: `/img/seed-merch/${image}.svg`,
        isMain: true,
        uploadStatus: "active",
      });
      if (variants) {
        const [option] = await tx
          .insert(productOptions)
          .values({
            productId: created.id,
            name: "Talla",
            selectorDisplay: "button",
          })
          .returning();
        for (const [sortOrder, value] of ["S", "M", "L"].entries()) {
          const [optionValue] = await tx
            .insert(productOptionValues)
            .values({ optionId: option.id, value, sortOrder })
            .returning();
          const [variant] = await tx
            .insert(productVariants)
            .values({
              productId: created.id,
              stock: sortOrder === 2 ? 0 : 8,
              sortOrder,
            })
            .returning();
          await tx.insert(productVariantOptionValues).values({
            productId: created.id,
            variantId: variant.id,
            optionId: option.id,
            optionValueId: optionValue.id,
          });
        }
      }
    }
    const festivalName = "Glitter · Edición demo merch";
    await tx
      .insert(festivals)
      .values({
        name: festivalName,
        status: "archived",
        festivalType: "glitter",
      })
      .onConflictDoNothing({ target: festivals.name });
    const [festival] = await tx
      .select({ id: festivals.id })
      .from(festivals)
      .where(eq(festivals.name, festivalName));
    const collections = [
      {
        slug: "demo-clasicos",
        name: "Clásicos Glitter",
        description: "Esos favoritos que van con vos todos los días.",
        imageUrl: "/img/seed-merch/clasicos-cover.png",
        campaignImageUrl: "/img/seed-merch/clasicos-campaign.png",
        showInHero: true,
        keys: ["polera", "tote", "agenda"],
        festivalId: null,
        isVisible: true,
      },
      {
        slug: "demo-colaboraciones",
        name: "Pequeñas alegrías",
        description:
          "Ilustración para regalar, pegar y coleccionar. Colaboración de demostración, sin festival asociado.",
        imageUrl: "/img/seed-merch/stickers.svg",
        showInHero: true,
        keys: ["stickers", "print"],
        festivalId: null,
        isVisible: true,
      },
      {
        slug: "demo-festival",
        name: "Recuerdos del festival",
        description:
          "Un pedacito de nuestra edición de muestra. Colección de demostración vinculada a un festival.",
        imageUrl: "/img/landing-festivals/festicker-characters.png",
        keys: ["polera", "pin"],
        festivalId: festival.id,
        isVisible: true,
      },
      {
        slug: "demo-borrador",
        name: "Próximamente (demo oculto)",
        description: "Colección en borrador para verificar la visibilidad.",
        imageUrl: null,
        keys: ["borrador"],
        festivalId: null,
        isVisible: false,
      },
    ];
    let createdCollections = 0;
    for (const [sortOrder, { keys, ...collection }] of collections.entries()) {
      const [created] = await tx
        .insert(merchCollections)
        .values({ ...collection, sortOrder: sortOrder + 1 })
        .onConflictDoNothing({ target: merchCollections.slug })
        .returning({ id: merchCollections.id });
      if (!created) continue;
      createdCollections++;
      await tx.insert(merchCollectionProducts).values(
        keys.map((key) => ({
          collectionId: created.id,
          productId: productIds.get(key)!,
        })),
      );
    }

    // Separate prices: polera 100 + tote 60 + 2 × stickers 20 (sale) = 200;
    // stickers 20 + pin 30 + print 45 = 95. The print is sold out, so the
    // second bundle demonstrates an unavailable combo.
    const bundles = [
      {
        slug: "demo-kit-clasicos",
        name: "Kit Clásicos Glitter",
        description:
          "Polera, tote y stickers para llevar Glitter a todas partes. Combo de demostración.",
        price: 165,
        isVisible: true,
        collectionSlugs: ["demo-clasicos"],
        components: [
          { key: "polera", quantity: 1 },
          { key: "tote", quantity: 1 },
          { key: "stickers", quantity: 2 },
        ],
      },
      {
        slug: "demo-combo-alegrias",
        name: "Combo Pequeñas alegrías",
        description:
          "Stickers, pin y print para regalar. Combo de demostración agotado.",
        price: 80,
        isVisible: true,
        collectionSlugs: ["demo-colaboraciones"],
        components: [
          { key: "stickers", quantity: 1 },
          { key: "pin", quantity: 1 },
          { key: "print", quantity: 1 },
        ],
      },
      {
        slug: "demo-combo-borrador",
        name: "Combo en preparación (demo oculto)",
        description: "Combo en borrador para verificar la visibilidad.",
        price: 80,
        isVisible: false,
        collectionSlugs: [],
        components: [
          { key: "tote", quantity: 1 },
          { key: "pin", quantity: 1 },
        ],
      },
    ];
    let createdBundles = 0;
    for (const [sortOrder, bundle] of bundles.entries()) {
      const { components, collectionSlugs, ...values } = bundle;
      const [created] = await tx
        .insert(merchBundles)
        .values({ ...values, sortOrder: sortOrder + 1 })
        .onConflictDoNothing({ target: merchBundles.slug })
        .returning({ id: merchBundles.id });
      if (!created) continue;
      createdBundles++;
      for (const [index, component] of components.entries()) {
        const productId = productIds.get(component.key)!;
        const [row] = await tx
          .insert(merchBundleComponents)
          .values({
            bundleId: created.id,
            productId,
            quantity: component.quantity,
            sortOrder: index,
          })
          .returning({ id: merchBundleComponents.id });
        // Every visible size is eligible; the customer picks one. A hidden
        // size stays out, or unhiding it later would add it to the combo.
        const variants = await tx
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(
            and(
              eq(productVariants.productId, productId),
              eq(productVariants.isVisible, true),
            ),
          );
        if (variants.length) {
          await tx.insert(merchBundleComponentVariants).values(
            variants.map((variant) => ({
              componentId: row.id,
              productId,
              variantId: variant.id,
            })),
          );
        }
      }
      if (collectionSlugs.length) {
        const memberships = await tx
          .select({ id: merchCollections.id })
          .from(merchCollections)
          .where(inArray(merchCollections.slug, collectionSlugs));
        if (memberships.length) {
          await tx.insert(merchBundleCollections).values(
            memberships.map((collection) => ({
              bundleId: created.id,
              collectionId: collection.id,
            })),
          );
        }
      }
    }
    return { createdProducts, createdCollections, createdBundles };
  });
}
