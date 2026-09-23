# Merch storefront, collections and bundles

## Scope

The first pass implemented the merch storefront redesign and independent collections. The second pass implements bundles ("combos"): fixed-price offers over existing merch products with shared inventory, from the admin editor through checkout, order snapshots, adjustments and exports.

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

Targeted collection, catalog and form tests, TypeScript and changed-file lint passed.

## Bundles: implemented behavior

A bundle is a separately purchasable offer referencing existing products. It has its own identity in the storefront, cart and order, but no duplicate products and no stock of its own.

### Admin workflow

- Admin → Store → Combos lists every bundle with its status (draft, published, published but sold out, published but not shown and why), price, separate total, saving and component count.
- The editor sets name, URL slug (`/merch/combos/<slug>`), description, optional cover (upload or approved URL; without one the storefront shows a collage of component images), store order, publication and collections. Collection membership is independent of the components' own collections.
- Components come from a searchable merch product picker. Each has a quantity (1–99) and, for products with variants, a set of eligible variants: one checked variant fixes it, several let the customer choose. A product may appear in more than one component (for example two shirts with separate size choices), but a bundle needs at least two distinct products. No rentals or nested bundles.
- The price is a fixed total in Bs (two decimals). The editor previews the current separate-purchase total, the saving and every blocking problem live, using the same rules the server applies.
- Drafts may be incomplete. Publishing requires: at least two distinct products; every component visible, purchasable merch; at least one visible eligible variant per variant component; selectable variants of a component sharing one individual selling price; and a positive price strictly below the cheapest separate purchase of the contents. Separate totals use current selling prices, including product discounts, never list prices.
- Saves are transactional and lock the bundle row. Component rows keep their ids across edits; switching a component to another product replaces it.
- `version` increases whenever the price or contents change (not for name, description, cover, order, publication or collections). Carts holding an older version must be confirmed before checkout.
- Deleting a bundle removes it from carts; orders keep their snapshots. Products used by a bundle cannot be deleted, and their eligible variants cannot be removed, until they leave the bundle.

### Runtime availability

A published bundle is shown and sold only while it still passes the sale rules against the live catalog: every component visible, purchasable merch with an available eligible variant, and the price below the cheapest separate purchase. If a component is hidden, moved to supplies, stops being purchasable or its price drops so the bundle is no longer a discount, the bundle disappears from the storefront and cart lines report it as unavailable. The admin list shows the reason. Divergent variant prices introduced after publishing are tolerated as long as every combination remains discounted.

### Customer experience

- `/merch` shows a "Combos" section when sellable bundles exist. Collection pages show their assigned bundles in "Combos de la colección". A collection holding only bundles counts as nonempty; its page shows the bundles without an empty product catalog.
- Cards show the cover or collage, item and product counts, the fixed price, the cheapest separate total struck through and "Ahorrás Bs X" ("Ahorrás desde" when selectable variants differ in price), and "Agotado" when no combination has stock.
- The bundle page (`/merch/combos/<slug>`, with canonical and sharing metadata) shows the cover, price, separate total and saving for the chosen combination, each included product with quantity and a link, fixed variant labels, pill selectors for choices (sold-out options disabled), pre-sale notes, availability, quantity (up to 5 per cart line) and one add-to-cart button. Its back link returns to the store or to a collection that lists the bundle, validated like product return links.
- The cart shows one grouped line per bundle configuration with expandable contents, the fixed price and separate total. Quantity changes or removal apply to the whole bundle; buying fewer components means buying them individually at their own prices. Bundles never form automatically from individual lines, and the store has no coupon codes to stack.

### Carts

- Authenticated carts store `cart_bundles` (bundle id, version seen, quantity and a canonical selection key so repeated adds merge) plus `cart_bundle_selections` (component → variant). Guest carts keep the same identity in local storage (`glitter_guest_cart_bundles`) with a display snapshot only.
- Every read re-resolves bundle lines on the server: current price and contents, the customer's choices and stock. Stock is shared: each line's limit subtracts the individual lines and all other bundle lines in the cart, and individual lines' limits subtract bundle demand, so two lines never count on the same last unit. Lines are flagged `unavailable`, `selection_invalid`, `stale` (version changed; "Aceptar precio actual" confirms the new version), `out_of_stock` or `stock_insufficient`, and checkout stays blocked until they are fixed.
- Guest resolution never reveals an unpublished bundle's name or price.

### Checkout and orders

- Browsers send only bundle id, the version they saw, quantity and choices. Checkout share-locks the bundles, then locks every product and variant row in id order (individual lines included), re-validates publication, merch category, purchasability, variants, current prices, discount and store closure, and rejects stale versions (`bundle_changed`) or unavailable bundles (`bundle_unavailable`).
- Demand from individual lines and bundle components is aggregated per stock pool before deducting; deduction reuses the conditional stock updates, so any failing component rejects the whole order. Concurrent checkouts of the last unit sell it once.
- The bundle price is split across component units in integer cents, proportionally to their individual selling prices. Largest-remainder rounding gives leftover cents to the units with the largest remainders (earlier components win ties), so a component's units may receive two amounts one cent apart; each amount becomes its own order line. Allocations always add up to the exact bundle price and never exceed a unit's individual price. Example: shirt Bs100 + tote Bs60 + 2 × stickers Bs10 = Bs180, sold for Bs150 → shirt Bs83.34, tote Bs50.00, stickers Bs8.33 each.
- Component lines are regular `order_items` priced at their allocation, so order totals, cancellation stock restoration, adjustments, returns, profitability and product totals use what was actually paid. `order_bundles` snapshot the bundle (id, version, name, slug, image, quantity, unit price, separate price and exact total in cents); `order_bundle_items` link each component line with its units per bundle, individual price and paid allocation in cents. Editing or deleting a bundle never changes an existing order.
- Customer order edits change bundles only as whole units: fewer or none, never more, and never single components. Admin adjustments may reduce component lines (refunding their allocation) but not increase them; extra units are added as individual products at their own price. Merchandise returns refund each component's paid allocation.
- Order pages (customer, guest, payment and admin) group bundle lines under the bundle name with its price; the admin view also shows each component's individual price. Compact lists and dialogs label bundle lines with their bundle. Confirmation emails list each bundle with its contents. The line CSV export adds `bundle_line_id`, `bundle_name` and `individual_unit_price_bs`; the summary export marks bundle lines.

### Schema

Migration `drizzle/0290_merch_bundles.sql` adds `merch_bundles`, `merch_bundle_components`, `merch_bundle_component_variants`, `merch_bundle_collections`, `cart_bundles`, `cart_bundle_selections`, `order_bundles` and `order_bundle_items`. Composite foreign keys keep eligible variants tied to their component's product and allocation rows tied to lines of the same order; checks enforce positive quantities, discounted order prices, `total = unit × quantity` and allocations within individual prices.

Deployment prerequisite: apply migrations through `0290_merch_bundles.sql`. The migration only creates tables; no existing data changes.

### Demo fixtures

`pnpm seed:merch` also creates "Kit Clásicos Glitter" (shirt with a size choice, tote and two sticker packs; Bs165 against Bs200, in "Clásicos Glitter"), "Combo Pequeñas alegrías" (Bs80 against Bs95; sold out because the print is), and a hidden draft. Reruns keep existing bundles.

### Verification

- Unit tests: allocation (exact sums, tiers, list-price ceiling, randomized runs), publish and sale rules, selections, shared-stock limits, order grouping, CSV columns, and component tests for the bundle page, admin editor, storefront section and cart row.
- Database tests (`app/lib/merch/bundles.integration.test.ts`, part of `pnpm test:integration`): snapshots and exact allocations, bundle and identical individual lines kept apart, combined demand above stock, concurrent checkout of the last component, stale versions and tampered choices or quantities, hidden variants and products, bundles no longer discounted, unpublished bundles, guest checkout, cancellation restoring each component once, returns refunding the allocation, admin publish validation and versioning, delete guards, cart resolution for stale, unavailable and over-demanded lines, authenticated add-to-cart through checkout, whole-bundle customer edits, and collections holding only bundles.
- Layout: the storefront section, bundle page, cart, checkout summary and admin editor were rendered with the app's compiled styles at desktop and 360–420 px widths without horizontal overflow. A live dev-server session was not possible in this environment (no Clerk development keys), so authenticated flows were verified through the database tests above rather than in a browser.

## Demo campaign artwork

Generated with the built-in image-generation tool. Asset: [`public/img/seed-merch/clasicos-campaign.png`](../public/img/seed-merch/clasicos-campaign.png). This is illustrative demo merchandise, not real inventory photography. Existing seeded collections are preserved on reruns; set their optional campaign banner in the collection editor.

Final generation prompt:

> Create one polished wide ecommerce campaign banner image, aspect ratio 2.4:1, for the fictional/demo collection 'Clásicos Glitter', an indie illustration festival merch shop. Image contains NO TEXT, NO LETTERS, NO LOGOS, NO UI, NO BUTTONS. Art direction: playful sophisticated tactile cut-paper / screenprinted editorial illustration, crisp layered shapes, slightly grainy paper, sunny butter yellow and warm cream background with coral red accents and tiny deep violet accents. Show exactly three stylized merchandise objects arranged as an energetic flat lay in the RIGHT 55 percent: an off-white short-sleeve T-shirt with a small abstract violet star motif, a golden natural-canvas tote bag with coral handles, a lavender spiral notebook with a little yellow star motif. Objects distinct and recognizable, softly overlapping at modest jaunty angles, tasteful paper shadows. Add a couple of small star-shaped paper cutouts, no additional objects. LEFT 40 percent mostly empty pale warm butter yellow/cream, unobstructed and low contrast, intentionally reserved for dark HTML headline overlay. Objects comfortably inset so a wide desktop crop preserves them. This is illustrative demo artwork, not photography or real inventory. Entire image should feel like a designed merch campaign, not a generic tech illustration. No mock browser, no panels, no border, no typography.
