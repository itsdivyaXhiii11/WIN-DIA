# WIN-DIA combo / checkout review

Reviewed: combo selector, cart slice, checkout page, orders API route, checkout service,
order/cart repositories, pricing constants, and the SQL in `supabase/migrations`.
Branch: `fix/combo-qty-checkout`.

**Not seen:** the live `create_checkout_order_transaction` and `calculate_windia_price`
functions. Everything below about the database is inferred from logs and from the repo's
frontend price table, and is marked as such.

---

## A. Why combos fail (root causes)

### A1. The app and the database disagree on what 1 combo is  (MAIN BLOCKER)
- **Backend** (`src/backend/services/checkout.service.ts`, `prepareLines` and `priceLines`):
  1 combo = 1 bundle, priced `calculate_windia_price(1)` = Rs 384.
- **Website** (`src/frontend/screens/Checkout/CheckoutPage.jsx`, `getBundlePrice`, line ~56):
  shows 1 combo as Rs 384 ("6 packets, 1 bundle").
- **Database** (inferred): stores `bundle_quantity` per flavour, which adds up to 6 per combo,
  and seems to price each combo as 6 bundles.
- **Evidence:** the frontend table gives 6 bundles = Rs 1664 and 12 bundles = 1664 + 6 x 256
  = **Rs 3200**. The failed order for 2 combos stored `items_price=3200`. The earlier working
  single-combo payload used price 1664. All of these match "1 combo = 6 bundles".
- **Effect:** every combo order fails with "Order total mismatch", including a single combo
  once the code counts it as 1 bundle.
- **Fix:** needs a business decision (Rs 384 per combo, or about Rs 1664). Then either
  (a) change the database so `bundle_quantity` counts packets, or
  (b) count a combo as 6 bundles in the code and change the website price.
  Do not change one side only.

### A2. Combo with quantity > 1 sent as ONE item  (fixed)
- The cart merges identical combos into one line with `qty: N` and one flavour set.
- It was sent as a single order item with `qty: N` and `combo_number: 1`, which raised
  `Invalid combo_number` (P0001).
- **Fix applied:** `priceLines` now sends N separate `qty: 1` items, each with its own copy
  of the selections.
- **Still unconfirmed:** whether the database wants distinct `combo_number` values (1, 2, 3)
  for several combos. Send the function definition to settle it.

### A3. Combo counted as 1 bundle whatever its quantity  (fixed)
- `prepareLines` set `bundles: 1` for a combo line, so 3 combos were priced as 1.
- **Fix applied:** `bundles: qty`. This will need to become `6 * qty` if A1 is decided as
  "6 bundles per combo".

---

## B. Other bugs found

### B1. Coupon never reaches the backend  (REAL BUG, not fixed)
- `CheckoutPage.jsx` line ~306 sends `couponCode`.
- `checkout.service.ts` line ~484 reads `dto.coupon_code`.
- The page tells the customer "10% off applied", but the backend ignores the coupon and
  charges the full price. The coupon is also never counted as used.
- **Suggested fix:** in `applyCoupon`, read `dto.coupon_code ?? (dto as any).couponCode`.

### B2. Failed total check leaves an unpaid order behind  (not fixed)
- `createOrder` creates the order through the database function, then compares totals. On a
  mismatch it returns an error but does not cancel the order.
- Every failed attempt leaves an unpaid order row (and shipment row) in the database.
- **Suggested fix:** call the existing order cancel path when the totals differ.

### B3. Cart delete with a slug id returned 500  (fixed)
- `DELETE /api/cart?productId=everyday-jeera` passed a slug to a uuid column.
- **Fix applied:** `cart.service.ts` `removeItem` resolves the slug first.

### B4. Combo flavour availability differs between UI and backend  (to verify)
- `ComboSelector.tsx` treats a flavour as available using the `available` flag passed in.
- `getAvailableFlavourIds` in the backend needs at least 6 packets in stock.
- A flavour with 1 to 5 packets could be selectable on the page and then rejected at
  checkout as unavailable. Check how `available` is set in `ProductDetail.tsx` and
  `GlutenFree.tsx`.

### B5. Default packet weight may be wrong  (to verify)
- `prepareLines` falls back to 200 g per packet when no weight is sent. The code comments say
  a packet is 40 g. If the frontend ever omits `netWeight`, shipment weight is 5x too high.

---

## C. Repo vs live database drift  (source of confusion)

- `supabase/migrations/20250110_update_bundle_pricing.sql` says 4 bundles = Rs 1280 and
  6 bundles = Rs 1792. The website table says 4 = 1152 and 6 = 1664. The logs match the
  website table, so the live function differs from this migration.
- `supabase/migrations/20260802_create_checkout_transaction.sql` has no combo handling and
  names the parameter `p_order_items`. The code calls it with `p_items` and sends
  `combo_selections`. The live function is clearly newer than what is in the repo.
- `src/backend/constants/bundle-pricing.constants.ts` still describes a 10-packet, Rs 640
  bundle with 2 free packets. It is stale, but only `MAX_BUNDLES_PER_ITEM` and
  `calculateOrderTotal` are used.
- Pricing is hard-coded again in `CheckoutPage.jsx` (`getBundlePrice`,
  `getPacketBreakdown`), although the constants file says it must be the single source of
  truth. If the database function changes, the page will show a different price.
- **Suggested fix:** commit the live SQL for both functions to the repo and have the page
  read the price from the backend instead of its own table.

---

## D. Checked and fine
- `isMultipleOfSix` in `CheckoutPage.jsx` is always true (packets are qty x 6). Harmless.
- Client prices are ignored by the backend, which is correct.
- Per-flavour stock checks multiply combo picks by quantity correctly.
- The orders route creates the order only after Razorpay config is checked.

---

## E. What is needed to finish
1. Answer from the database owner: is 1 combo 1 bundle or 6 bundles, and what is the right
   price? Plus the result of
   `select calculate_windia_price(6), calculate_windia_price(12);` (expected 1664 and 3200).
2. Output of
   `select pg_get_functiondef(oid) from pg_proc where proname = 'create_checkout_order_transaction';`
   to confirm how several combos should be numbered.
3. Then: change the combo bundle count (A1), fix the coupon key (B1), cancel failed orders
   (B2), and test 1 combo, 2 combos, and a combo plus a regular flavour.
