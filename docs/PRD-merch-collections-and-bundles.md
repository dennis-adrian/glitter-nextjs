# Merch storefront, collections and bundles

## Scope

This pass implements the merch storefront redesign and independent collections. Bundles below are a proposal for the next implementation; they are not purchasable yet.

## Storefront direction

Use Glitter's existing identity: ink `#29005c`, purple `#6200cb`, lavender `#eae2ff`, coral `#ff655b`, white `#ffffff`. Gabarito for expressive headings, Figtree for navigation, product names and prices. Left-aligned content, a campaign hero, collection artwork, horizontal collection browsing, then a two/four-column catalog with lightly bordered product cards.

The initial generic shop direction was refined around real collection artwork and names. No invented campaigns, reviews, shipping promises or discount claims. Empty collections are omitted; a store with no products has a deliberate empty state.

Mobbin references inspected:

- [Selfridges seasonal collection sections](https://mobbin.com/screens/b5459f30-58e9-48da-8add-91a1bc80e6b3): image-led entry points with a specific shopping action, followed by products.
- [Urban Outfitters editorial browsing](https://mobbin.com/screens/7a2b59e2-4973-4808-9082-5de52fec353d): distinct visual stories make browsing more than a product grid.
- [lululemon shop-the-look drawer](https://mobbin.com/screens/60199bed-a902-44fd-856e-e5ff03b21d8d): show each component and let customers choose its size. This is a grouped shopping reference, not evidence of bundle discounts.
- [Hers bundle detail](https://mobbin.com/screens/883f4dd8-cdeb-4fae-9c39-17df20367d71): dedicated bundle imagery, contents and a single purchase action. Its subscription pricing is not part of this proposal.

## Collections: implemented behavior

- Collections are independent: name, unique URL slug, description, collection cover, optional campaign banner, publication status, main-banner selection and display order. A festival association is optional.
- Create/edit collections and select products in Admin → Store → Collections. Upload a cover or use an approved image URL. The campaign editor previews the actual banner copy, image, gradient and selected contrast before saving. New collections default to draft. Collection order starts at 1.
- Product Add/Edit also supports collection assignment. Products can belong to multiple collections; unassigned products remain in all merch.
- Public collections contain only visible merch. Empty or unpublished collections do not appear. Festival status does not control publication or artwork.
- Moving a product to supplies removes its assignments. Deleting a festival only clears the optional association; the collection and its products survive. Deleting a product removes its membership rows.
- Only admins can write. Product assignments and collection edits save transactionally; invalid references or duplicate URLs reject the save.
- Each collection has a dedicated `/merch/collections/<slug>` page with its title, description, artwork, products, canonical URL and sharing metadata. Its navigation is a single link back to the store. Search, stock filters and sorting stay scoped to that collection. Clearing filters keeps the collection selected. Product detail links carry the originating store or collection URL and current catalog filters; the product page validates collection membership before offering a return link. Direct product visits fall back to the store. Old `/merch?collection=<slug-or-id>` links redirect to the new page, preserving shopping filters. Unpublished, empty and unknown collections are unavailable. Changing a slug changes the shareable link.
- Lower display-order values appear first, with newest collection ID breaking ties. Admins can select any number of collections for the main banner. Only published nonempty collections are eligible; the selected collections appear in store order and rotate every eight seconds. Shoppers can move backward or forward and pause/resume. Manual navigation pauses rotation; hovering or focusing the banner suspends it, hidden tabs stop it, and reduced-motion users start paused. When none are selected, the first published nonempty collection remains the banner. Search and sorting do not hide it. A campaign image spans the hero on desktop, with a readability overlay behind the text; mobile stacks the image and text. Admins choose dark text and a light overlay for pale images, or light text and a dark overlay for navy/black images. Without a campaign image, the collection cover appears on Glitter’s purple fallback. Card covers stay independent.
- Existing cart, variant, rental and store-closure rules continue to apply.

Deployment prerequisite: apply migrations through `0289_merch_collection_one_based_order.sql`. Keep migration 0284 intact for existing installations. Migration 0285 copies existing festival collections (name, description and artwork), preserves IDs/product memberships, keeps former draft festival collections unpublished, and advances the ID sequence. Migration 0289 increments existing collection order values while preserving their relative order. New collections have no dependency on festivals. No products are assigned by name inference.

Targeted database verification (creates/removes an isolated schema in local test Postgres, never loads `.env.local`):

```sh
GLITTER_TEST_DB_PORT=55439 pnpm db:test:up
MERCH_TEST_DATABASE_URL=postgres://glitter:glitter@127.0.0.1:55439/glitter_test pnpm exec vitest run app/lib/merch/collections.integration.test.ts
```

## Local validation

The isolated preview uses `127.0.0.1:56517/glitter_test`, with idempotent merch fixtures. Browser checks covered generic collection creation, product membership edits, publishing/unpublishing, collection and availability filters, accent-insensitive search, discounted-price sorting, sold-out size selection, and an authenticated cart with the selected size. Desktop and narrow mobile layouts were inspected before the latest refinements; minimum-width overflow in the shared footer/store subheader was corrected. No payment was submitted.

Targeted collection, catalog and form tests, TypeScript and changed-file lint passed. Bundles remain a specification only.

## Bundle proposal: fixed contents, shared inventory

A bundle is a separately merchandised offer referencing existing products. Admins select its contents, quantities, name, cover and price. It is not a duplicate product with separately maintained stock.

### Admin workflow

1. Create a bundle; enter name, description and cover (optional fallback collage of component images).
2. Add at least two different purchasable merch products and positive integer quantities. No nested bundles or rentals in v1.
3. For each component, select a fixed variant or allow the customer to choose from explicitly eligible variants.
4. Choose an optional collection; require its component products to belong to that collection.
5. Enter a fixed total in Bs. Display the current separate-purchase total and savings preview.
6. Publish only when the price is positive and strictly below the separate-purchase total for every allowed variant combination. Price changes require revalidation; unavailable or no-longer-discounted combinations cannot be checked out as bundles.

Start with fixed prices, not stacked percentage rules. If size/color variants have different prices, either constrain eligible variants to a shared price or make separate bundles. This keeps the displayed bundle total stable.

Example: shirt Bs100 + tote Bs60 + stickers Bs20 = Bs180 separately; bundle Bs150; “Ahorrás Bs30”. Compare against the actual current individual selling prices, including existing discounts, never an inflated list price.

### Customer experience

- Separate “Combos” storefront section when published bundles exist.
- Bundle page: cover, total, separate total struck through, savings, included products/quantities, required size/color selectors, availability and one add-to-cart button.
- Cart: one grouped offer with expandable components. Change quantity or remove the whole bundle. To buy fewer components, remove it and purchase separately at individual prices.
- No automatic bundle conversion when shoppers add individual products; no additional coupon stacking in v1.

### Inventory and checkout

- No independent bundle stock. Availability is limited by the scarcest component: `min(floor(available component stock / required quantity))` for the selected variants.
- Aggregate demand across bundles AND individual cart lines before checking stock. Two bundles sharing a shirt cannot both consume the same last shirt.
- Reuse the existing stock reservation/deduction lifecycle. Lock component stock rows in deterministic order, revalidate visibility/variants/current prices, and reserve/deduct all components atomically. A failed component rejects the whole bundle.
- Persist stable bundle identity in guest and authenticated carts; server resolves all contents and prices again at checkout. Do not trust totals or component lists from the browser.
- Preserve immutable order snapshots: bundle name/version, selected products/variants, quantities, component prices, allocated discount and final bundle total. Editing a bundle must never change an existing order.
- Allocate the paid bundle price proportionally across component prices using integer cents and deterministic remainder allocation. Order totals, costs, margin reports and refunds must sum to the exact paid amount.
- Full cancellation restores each component through existing lifecycle rules. Partial returns refund the component's paid allocation; never its undiscounted retail price. Extend admin adjustments, email receipts, exports and analytics to retain grouping and allocation.

### Suggested schema

- `merch_bundles`: name, slug, cover, description, optional collection ID, price in fixed-precision money, publication status, version and timestamps.
- `merch_bundle_components`: bundle ID, product ID, optional fixed variant ID, quantity, display order. Explicit allowed-variant links for selectable components.
- Cart bundle groups plus selected component variants; do not flatten away bundle identity.
- Order bundle groups plus existing component order lines, immutable price/discount snapshots and per-component paid allocation.

### Required verification for the bundle pass

Concurrent checkout of the last component; overlapping bundles and individual lines; sold-out/hidden/deleted variants; changed prices; stale guest carts; tampered totals; partial/full cancellations; refunds and cent rounding; emails and reporting; idempotent stock restoration; mobile variant selection and cart grouping.

## Demo campaign artwork

Generated with the built-in image-generation tool. Asset: [`public/img/seed-merch/clasicos-campaign.png`](../public/img/seed-merch/clasicos-campaign.png). This is illustrative demo merchandise, not real inventory photography. Existing seeded collections are preserved on reruns; set their optional campaign banner in the collection editor.

Final generation prompt:

> Create one polished wide ecommerce campaign banner image, aspect ratio 2.4:1, for the fictional/demo collection 'Clásicos Glitter', an indie illustration festival merch shop. Image contains NO TEXT, NO LETTERS, NO LOGOS, NO UI, NO BUTTONS. Art direction: playful sophisticated tactile cut-paper / screenprinted editorial illustration, crisp layered shapes, slightly grainy paper, sunny butter yellow and warm cream background with coral red accents and tiny deep violet accents. Show exactly three stylized merchandise objects arranged as an energetic flat lay in the RIGHT 55 percent: an off-white short-sleeve T-shirt with a small abstract violet star motif, a golden natural-canvas tote bag with coral handles, a lavender spiral notebook with a little yellow star motif. Objects distinct and recognizable, softly overlapping at modest jaunty angles, tasteful paper shadows. Add a couple of small star-shaped paper cutouts, no additional objects. LEFT 40 percent mostly empty pale warm butter yellow/cream, unobstructed and low contrast, intentionally reserved for dark HTML headline overlay. Objects comfortably inset so a wide desktop crop preserves them. This is illustrative demo artwork, not photography or real inventory. Entire image should feel like a designed merch campaign, not a generic tech illustration. No mock browser, no panels, no border, no typography.
