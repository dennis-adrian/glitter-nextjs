// @vitest-environment node
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";

const state = vi.hoisted(() => ({
  db: undefined as unknown as NodePgDatabase<typeof schema>,
  role: "admin",
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: async () => ({ role: state.role }),
}));
// This isolated schema has no bundle tables; bundle membership is covered by
// the bundle integration tests.
vi.mock("./bundles", () => ({ fetchPublicBundles: async () => [] }));
import {
  fetchCollectionEditorData,
  fetchMerchCollections,
  syncMerchCollections,
} from "./collections";

import { saveMerchCollection } from "./actions";

// Explicit opt-in, with a loopback + test-database guard. Never reads .env.local.
const connectionString = process.env.MERCH_TEST_DATABASE_URL;
if (connectionString) {
  const url = new URL(connectionString);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/glitter_test"
  )
    throw new Error("Use disposable local glitter_test only");
}

describe.skipIf(!connectionString)(
  "festival collection migration and persistence",
  () => {
    const client = new Client({ connectionString });
    let backfilled: {
      id: number;
      slug: string;
      is_visible: boolean;
      festival_id: number;
      sort_order: number;
    }[] = [];
    const namespace = `merch_test_${process.pid}_${Date.now()}`;
    beforeAll(async () => {
      await client.connect();
      await client.query(`CREATE SCHEMA "${namespace}"`);
      await client.query(`SET search_path TO "${namespace}"`);
      await client.query(
        `CREATE TABLE festivals (id integer PRIMARY KEY, name text NOT NULL, description text, status text NOT NULL, festival_banner_url text, thumbnail_url text, poster_url text, start_date timestamp, created_at timestamp DEFAULT now()); CREATE TABLE products (id integer PRIMARY KEY, name text DEFAULT 'Product', is_visible boolean NOT NULL DEFAULT true, store_category text NOT NULL DEFAULT 'merch')`,
      );
      const migration = await readFile(
        new URL(
          "../../../drizzle/0284_merch_festival_collections.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await client.query(migration.replaceAll('"public".', `"${namespace}".`));
      await client.query(
        "INSERT INTO festivals (id,name,status) VALUES (8,'Legacy public','published'),(9,'Legacy draft','draft'); INSERT INTO products (id) VALUES (8); INSERT INTO merch_collection_products VALUES (8,8),(9,8)",
      );
      const independentMigration = await readFile(
        new URL(
          "../../../drizzle/0285_independent_merch_collections.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await client.query(
        independentMigration.replaceAll('"public".', `"${namespace}".`),
      );
      await client.query(
        await readFile(
          new URL(
            "../../../drizzle/0286_merch_campaign_banner.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await client.query(
        await readFile(
          new URL(
            "../../../drizzle/0287_merch_campaign_text_tone.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await client.query(
        await readFile(
          new URL(
            "../../../drizzle/0288_merch_featured_banner_collections.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await client.query(
        await readFile(
          new URL(
            "../../../drizzle/0289_merch_collection_one_based_order.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      backfilled = (
        await client.query(
          "SELECT id, slug, is_visible, festival_id, sort_order FROM merch_collections ORDER BY id",
        )
      ).rows;
      expect(
        (
          await client.query(
            "SELECT collection_id FROM merch_collection_products ORDER BY collection_id",
          )
        ).rows,
      ).toEqual([{ collection_id: 8 }, { collection_id: 9 }]);
      state.db = drizzle(client, { schema });
    });
    beforeEach(async () => {
      state.role = "admin";
      await client.query(
        "TRUNCATE merch_collection_products, merch_collections, festivals, products CASCADE",
      );
      await client.query(
        "INSERT INTO festivals (id,name,status,start_date) VALUES (1,'Archived edition','archived','2025-01-01'),(2,'Draft edition','draft','2027-01-01'),(3,'Published edition','published','2026-01-01'); INSERT INTO products (id,is_visible,store_category) VALUES (1,true,'merch'),(2,false,'merch'),(3,true,'supplies'),(4,true,'merch')",
      );
      await client.query(
        "INSERT INTO merch_collections (id,name,slug,is_visible,sort_order,festival_id) VALUES (1,'Archive','archive',true,2,1),(2,'Draft','draft',false,1,2),(3,'Classics','classics',true,1,NULL)",
      );
    });
    afterAll(async () => {
      try {
        await client.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
      } finally {
        await client.end();
      }
    });
    it("saves multiple collections, deduplicates IDs and replaces assignments", async () => {
      await state.db.transaction((tx) =>
        syncMerchCollections(tx, 1, [1, 3, 3], "merch"),
      );
      expect((await fetchCollectionEditorData(1)).selectedIds.sort()).toEqual([
        1, 3,
      ]);
      await state.db.transaction((tx) =>
        syncMerchCollections(tx, 1, [3], "merch"),
      );
      expect((await fetchCollectionEditorData(1)).selectedIds).toEqual([3]);
    });
    it("preserves assignments on invalid writes and clears them when moved to supplies", async () => {
      await state.db.transaction((tx) =>
        syncMerchCollections(tx, 1, [1], "merch"),
      );
      await expect(
        state.db.transaction((tx) =>
          syncMerchCollections(tx, 1, [999], "merch"),
        ),
      ).rejects.toThrow();
      await expect(
        state.db.transaction((tx) =>
          syncMerchCollections(tx, 1, [-1], "merch"),
        ),
      ).rejects.toThrow();
      expect((await fetchCollectionEditorData(1)).selectedIds).toEqual([1]);
      await state.db.transaction((tx) =>
        syncMerchCollections(tx, 1, undefined, "merch"),
      );
      expect((await fetchCollectionEditorData(1)).selectedIds).toEqual([1]);
      await state.db.transaction((tx) =>
        syncMerchCollections(tx, 1, undefined, "supplies"),
      );
      expect((await fetchCollectionEditorData(1)).selectedIds).toEqual([]);
    });
    it("publishes visible independent collections in editorial order with visible merch only", async () => {
      await client.query(
        "INSERT INTO merch_collection_products VALUES (1,1),(2,1),(3,4),(3,2),(3,3)",
      );
      const collections = await fetchMerchCollections();
      expect(
        collections.map(({ id, productIds }) => ({ id, productIds })),
      ).toEqual([
        { id: 3, productIds: [4] },
        { id: 1, productIds: [1] },
      ]);
    });
    it("restricts editor data to admins", async () => {
      state.role = "user";
      await expect(fetchCollectionEditorData(1)).rejects.toThrow(
        "Unauthorized",
      );
    });
    it("enforces references, uniqueness and cascading deletion", async () => {
      await client.query(
        "INSERT INTO merch_collection_products VALUES (1,1),(3,4)",
      );
      await expect(
        client.query("INSERT INTO merch_collection_products VALUES (1,1)"),
      ).rejects.toThrow();
      await expect(
        client.query("INSERT INTO merch_collection_products VALUES (999,1)"),
      ).rejects.toThrow();
      await client.query(
        "DELETE FROM festivals WHERE id=1; DELETE FROM products WHERE id=4",
      );
      expect(
        (await client.query("SELECT * FROM merch_collection_products")).rows,
      ).toEqual([{ collection_id: 1, product_id: 1 }]);
      expect(
        (
          await client.query(
            "SELECT festival_id FROM merch_collections WHERE id=1",
          )
        ).rows,
      ).toEqual([{ festival_id: null }]);
      await client.query("DELETE FROM merch_collections WHERE id=1");
      expect(
        (await client.query("SELECT * FROM merch_collection_products")).rows,
      ).toEqual([]);
    });
    it("backfills festival memberships and keeps draft collections unpublished", () => {
      expect(backfilled).toEqual([
        {
          id: 8,
          slug: "festival-8",
          is_visible: true,
          festival_id: 8,
          sort_order: 2,
        },
        {
          id: 9,
          slug: "festival-9",
          is_visible: false,
          festival_id: 9,
          sort_order: 1,
        },
      ]);
    });
    const input = {
      name: "Artist collaboration",
      slug: "artist-collaboration",
      description: "A special release",
      imageUrl: "",
      campaignImageUrl: "/img/seed-merch/clasicos-campaign.png",
      campaignTextTone: "light" as const,
      showInHero: true,
      festivalId: null,
      isVisible: true,
      sortOrder: 1,
      productIds: [1, 4],
    };
    it("creates and edits a collection without a festival and controls publication", async () => {
      const created = await saveMerchCollection(input);
      expect(created.success).toBe(true);
      expect(created.collectionId).toBeGreaterThan(9);
      expect(
        (await fetchMerchCollections()).find(
          (item) => item.id === created.collectionId,
        ),
      ).toMatchObject({
        slug: input.slug,
        description: input.description,
        campaignImageUrl: input.campaignImageUrl,
        campaignTextTone: "light",
        showInHero: true,
        productIds: [1, 4],
      });
      expect(
        (
          await client.query(
            "SELECT campaign_text_tone FROM merch_collections WHERE id=$1",
            [created.collectionId],
          )
        ).rows[0].campaign_text_tone,
      ).toBe("light");
      expect(
        (
          await saveMerchCollection({
            ...input,
            id: created.collectionId,
            isVisible: false,
          })
        ).success,
      ).toBe(true);
      expect(
        (await fetchMerchCollections()).find(
          (item) => item.id === created.collectionId,
        ),
      ).toBeUndefined();
    });
    it("rejects duplicate slugs, invalid associations and unauthorized changes atomically", async () => {
      expect(
        (await saveMerchCollection({ ...input, sortOrder: 0 })).success,
      ).toBe(false);
      expect(
        (
          await saveMerchCollection({
            ...input,
            campaignImageUrl: "https://untrusted.example/banner.png",
          })
        ).success,
      ).toBe(false);
      expect(
        (await saveMerchCollection({ ...input, slug: "classics" })).success,
      ).toBe(false);
      expect(
        (await saveMerchCollection({ ...input, festivalId: 999 })).success,
      ).toBe(false);
      expect(
        (await saveMerchCollection({ ...input, id: 1, productIds: [3] }))
          .success,
      ).toBe(false);
      expect(
        (await client.query("SELECT name FROM merch_collections WHERE id=1"))
          .rows[0].name,
      ).toBe("Archive");
      state.role = "user";
      expect((await saveMerchCollection(input)).success).toBe(false);
      expect(
        (
          await client.query(
            "SELECT count(*)::int AS count FROM merch_collections",
          )
        ).rows[0].count,
      ).toBe(3);
    });
  },
);
