# Feature Specification: Egyptian Grocery E-Commerce Platform

**Feature Branch**: `claude/egyptian-grocery-ecommerce-ak98ny`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "A grocery e-commerce website for the Egyptian market. Bilingual Arabic/English with Arabic default and full RTL. Customers sign up with full name, phone, city, delivery address and landmark; they log in with phone and password, with no SMS verification and no email. Customers browse by category, search, see promotions and discounted prices, add to cart and place an order. There is no online payment — everything is cash on delivery and the site's only job is to capture the order. Staff manage products, categories, brands, promotions and delivery cities from an admin area without touching code. Staff move orders through submitted, confirmed, preparing, out for delivery, delivered, plus cancelled and returned, with every change logged. Customers see their own order history, follow live status, and cancel before confirmation. Mobile-first, near-zero running cost, server-computed totals, and strict isolation of customer data and cost prices."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse the catalog and place a cash-on-delivery order (Priority: P1)

A shopper opens the site in Arabic on their phone. They browse a category such as
dairy, tap a product to see its photos, pack size and price, and add a few items to
their cart. Some items show a promotional price struck through against the original.
They open the cart, see the item subtotal, the delivery fee for their city, and the
grand total. They sign in (or register), pick a saved delivery address, and confirm the
order. The order is recorded as *submitted* and they are told a staff member will call
to confirm.

**Why this priority**: This is the entire commercial purpose of the system. Every other
story exists to support or administer it. Without this, there is no product.

**Independent Test**: With a manually seeded catalog and one delivery city, a new
customer can register, add products to a cart, and place an order that appears in the
database with correct, server-computed totals — verifiable end-to-end without any admin
UI existing.

**Acceptance Scenarios**:

1. **Given** a visitor with no session on a phone-sized screen, **When** they open the
   site, **Then** the interface renders in Arabic with right-to-left layout and a
   browsable list of product categories.
2. **Given** a product with a currently active promotion, **When** the shopper views it
   in a listing or on its detail page, **Then** both the original price and the reduced
   price are shown, with the reduction clearly indicated.
3. **Given** a product whose promotion window has already ended, **When** the shopper
   views it, **Then** only the normal price is shown and no discount is applied at
   checkout.
4. **Given** a cart containing items, **When** the shopper changes the delivery city,
   **Then** the delivery fee and the grand total update to that city's fee.
5. **Given** a cart whose item subtotal is below the selected city's minimum order
   value, **When** the shopper attempts to place the order, **Then** the order is
   refused and the shopper is told how much more they need to add.
6. **Given** a shopper who has manipulated the prices or totals held in their browser,
   **When** they place the order, **Then** the recorded order reflects the prices held
   by the system, not the values supplied by the browser.
7. **Given** a product with a minimum order quantity of 6, **When** the shopper tries to
   order 3, **Then** the order is refused with an explanation naming the minimum.
8. **Given** a product whose stock has fallen below the requested quantity since the
   item was added to the cart, **When** the shopper places the order, **Then** the order
   is refused and the shopper is shown which item is unavailable.
9. **Given** a successfully placed order, **When** the shopper is returned to the
   confirmation screen, **Then** they see an order reference, the ordered lines with
   their prices, the delivery fee, the grand total, and a statement that payment is cash
   on delivery.

---

### User Story 2 - Register and sign in with a phone number (Priority: P1)

A new customer registers with their full name, mobile number, city, delivery address and
a landmark that lets a driver find the building. They choose a password. There is no
verification code and no email address. On later visits they sign in with the same phone
number and password.

**Why this priority**: An order cannot be attributed, delivered, or followed up without an
identified customer. It is inseparable from Story 1 and shares its priority.

**Independent Test**: A person can register with a valid Egyptian mobile number, sign
out, sign back in with that number and password, and see their own profile and saved
address — with no catalog present.

**Acceptance Scenarios**:

1. **Given** the registration form, **When** the customer submits full name, mobile
   number, city, delivery address, landmark and password, **Then** the account is created
   and they are signed in immediately with no verification step.
2. **Given** a mobile number already registered, **When** someone attempts to register it
   again, **Then** registration is refused with a message saying the number is already in
   use.
3. **Given** the same Egyptian number entered in different notations (local leading-zero
   form, international form with country code, or with spaces or dashes), **When** it is
   submitted at registration or sign-in, **Then** the system treats all of these as the
   same single number.
4. **Given** a value that is not a valid Egyptian mobile number, **When** it is submitted,
   **Then** it is rejected before an account is created.
5. **Given** a registration attempt with the delivery landmark left empty, **When** it is
   submitted, **Then** it is refused, because drivers cannot locate addresses without one.
6. **Given** a signed-in customer, **When** they switch the interface language, **Then**
   they remain signed in, their cart is unchanged, and they stay on the same page.
7. **Given** repeated failed sign-in attempts for one number in a short period, **When**
   further attempts are made, **Then** the system temporarily refuses additional attempts
   for that number.

---

### User Story 3 - Staff manage the catalog and delivery footprint (Priority: P1)

A staff member signs into the admin area and adds a new product: names and descriptions in
both Arabic and English, category, brand, price, unit type, pack size, units per carton,
weight, barcode, SKU, stock, minimum order quantity, storage type, and several photos.
They also create categories and brands, set up a promotion with a start and end date, and
add a delivery city with its fee and minimum order value.

**Why this priority**: Without master data, the storefront has nothing to sell. It is
required for Story 1 to be usable by real customers rather than by a seeding script.

**Independent Test**: A staff account can create a category, a brand, and a product with
both language variants and photos, and that product then appears on the storefront —
verifiable without any customer having registered.

**Acceptance Scenarios**:

1. **Given** a staff member on the product form, **When** they save a product with the
   Arabic name filled but the English name blank, **Then** the save is refused and the
   missing field is identified.
2. **Given** a saved product with photos, **When** a shopper opens its detail page,
   **Then** all photos appear in the order staff arranged them, with the designated
   primary photo shown first.
3. **Given** a promotion configured with a start date in the future, **When** a shopper
   views the affected products before that date, **Then** no discount is shown or applied.
4. **Given** an active promotion, **When** its end date passes, **Then** affected products
   return to their normal price with no staff action required.
5. **Given** a delivery city with a fee and a minimum order value, **When** a shopper
   selects that city, **Then** those exact values govern their cart totals.
6. **Given** a city marked inactive by staff, **When** a shopper opens the city selector,
   **Then** that city is not offered.
7. **Given** a staff member editing a product's price, **When** they save, **Then** the
   new price applies to subsequent orders while previously placed orders retain the price
   they were charged.
8. **Given** a signed-in customer who is not staff, **When** they navigate directly to any
   admin address, **Then** they are denied access and no administrative data is returned
   to them.

---

### User Story 4 - Staff process orders through their lifecycle (Priority: P2)

A staff member opens the orders queue, sees newly submitted orders, phones the customer to
confirm, and marks the order *confirmed*. Later the order is marked *preparing*, handed to
a driver as *out for delivery*, and finally *delivered*. Some orders are cancelled; some
come back as returned. Each change records who made it and when.

**Why this priority**: Orders can be captured and fulfilled manually for a short period by
reading the queue, so this is not strictly required for first revenue — but the operation
does not scale a single day without it.

**Independent Test**: With one submitted order present, a staff account can advance it
through each state and the resulting history shows every transition with actor and
timestamp.

**Acceptance Scenarios**:

1. **Given** the orders queue, **When** a staff member opens it, **Then** they see all
   orders with reference, customer name, phone, city, total and current state, and can
   filter by state.
2. **Given** an order in *submitted*, **When** staff mark it *confirmed*, **Then** the
   state changes and a history entry records the previous state, the new state, the staff
   member's identity and the time.
3. **Given** an order in *submitted*, **When** staff attempt to mark it *delivered*
   directly, **Then** the change is refused as an invalid transition.
4. **Given** an order already *delivered*, **When** staff attempt to move it back to
   *preparing*, **Then** the change is refused.
5. **Given** an order in any state before delivery, **When** staff cancel it, **Then** it
   moves to *cancelled* and no further transitions other than to a terminal state are
   permitted.
6. **Given** a delivered order returned by the customer, **When** staff mark it
   *returned*, **Then** the state changes and the history records it.
7. **Given** any order, **When** its history is inspected, **Then** no historical entry can
   be altered or removed by any user.

---

### User Story 5 - Customers follow and cancel their own orders (Priority: P2)

A customer opens their account, sees a list of their past and current orders, opens one to
see its lines and totals, and follows its progress through the stages. If it has not yet
been confirmed by staff, they can cancel it themselves.

**Why this priority**: It removes a large share of "where is my order" phone calls, but the
business can function on phone calls alone at first.

**Independent Test**: With two customers each holding orders, each sees only their own list,
and a customer can cancel an order that is still submitted but not one already confirmed.

**Acceptance Scenarios**:

1. **Given** a signed-in customer with previous orders, **When** they open their order
   history, **Then** they see only their own orders, most recent first.
2. **Given** two customers, **When** one attempts to open the other's order by its
   reference or address, **Then** access is denied and no order content is disclosed.
3. **Given** an order in *submitted*, **When** the customer cancels it, **Then** it moves to
   *cancelled* and the history records the customer as the actor.
4. **Given** an order already *confirmed* or later, **When** the customer attempts to
   cancel, **Then** the cancel action is unavailable and refused if forced.
5. **Given** an order whose state staff have changed, **When** the customer next views it,
   **Then** they see the current state and the sequence of stages already completed.
6. **Given** any order view available to a customer, **When** it is rendered, **Then** it
   discloses no cost price or margin information.

---

### User Story 6 - Search and discover promotions (Priority: P3)

A shopper types part of a product or brand name in either Arabic or English and gets
matching products. From the home screen they can also open a dedicated view of everything
currently discounted.

**Why this priority**: Browsing by category is sufficient for a modest catalog. Search and a
promotions view materially improve conversion once the catalog grows.

**Independent Test**: With a seeded catalog, searching a term in Arabic and the equivalent
term in English each return the same product, and the promotions view lists exactly those
products with an active discount.

**Acceptance Scenarios**:

1. **Given** a catalog with bilingual product names, **When** the shopper searches a term in
   Arabic, **Then** products whose Arabic name, description or brand match are returned.
2. **Given** the same catalog, **When** the shopper searches the English equivalent,
   **Then** the corresponding products are returned.
3. **Given** a search with no matches, **When** results render, **Then** the shopper is told
   nothing matched and is offered a way back to category browsing.
4. **Given** promotions active and expired, **When** the shopper opens the promotions view,
   **Then** only products with a currently active discount appear.
5. **Given** a search or category listing, **When** results exceed one screen, **Then**
   further results load without the shopper losing their position.

---

### User Story 7 - Owners and managers read the numbers (Priority: P2)

The owner opens a dashboard and sees how the business is doing: revenue for the period, how
many orders came in and how many were actually delivered, the average basket, which products
and categories sell, which cities order most, how many customers are new versus returning, and
how much is being lost to cancellations and returns. They pick a date range, drill into a
report, and download it as a spreadsheet to work on offline or share with an accountant.

An ordinary staff member can see operational counts — how many orders are waiting, what is out
for delivery, what is running low on stock — but never cost, margin or profit.

**Why this priority**: The business runs without it — orders still arrive and get delivered —
but decisions about pricing, stock and promotions are guesswork until someone can see the
numbers. It ranks alongside order operations rather than above them.

**Independent Test**: With a period of seeded orders across several statuses, cities and
products, the dashboard totals reconcile exactly against the underlying orders, and a downloaded
export opens in a spreadsheet with Arabic text rendering correctly.

**Acceptance Scenarios**:

1. **Given** a date range with delivered and cancelled orders, **When** the owner opens the
   dashboard, **Then** revenue counts delivered orders only, and cancelled and returned orders
   are excluded from it and reported separately.
2. **Given** any dashboard figure, **When** it is compared against the individual orders behind
   it, **Then** the two reconcile exactly.
3. **Given** a chosen date range, **When** figures are grouped by day, **Then** each day runs
   from midnight to midnight **Egypt local time**, not by any other clock.
4. **Given** the dashboard, **When** the owner changes the date range, **Then** every figure,
   list and chart on the page updates to that range.
5. **Given** an administrator, **When** they open a product performance report, **Then** they
   see cost, margin and profit alongside revenue.
6. **Given** an ordinary staff member, **When** they open the reports area, **Then** they see
   operational counts only, and no cost, margin or profit figure appears anywhere — including in
   any file they can download.
7. **Given** any report on screen, **When** the user downloads it, **Then** the file contains
   the same rows and totals as the screen for the same date range.
8. **Given** a downloaded file containing Arabic product names, **When** it is opened in
   Excel, **Then** the Arabic text displays correctly rather than as unreadable characters.
9. **Given** a report with no data in the chosen range, **When** it is opened or downloaded,
   **Then** the user is told the range is empty rather than being given a broken or misleading
   file.
10. **Given** a report of several thousand rows, **When** it is downloaded, **Then** the file
    is produced without the page failing or timing out.
11. **Given** the dashboard, **When** products fall below a stock threshold, **Then** they are
    listed so staff can reorder.

---

### Edge Cases

- **Price changes mid-cart**: a product's price changes between the shopper adding it and
  placing the order. The order is placed at the price current at placement time, and the
  shopper is shown the change before it is committed rather than being silently charged
  more.
- **Promotion expires mid-cart**: the discount lapses between adding and ordering. The
  order records the undiscounted price, and the shopper is informed before commitment.
- **Stock exhausted mid-cart**: two shoppers order the last unit concurrently. Exactly one
  order succeeds; the other is refused with the affected item named.
- **Stock reduced by staff below a cart quantity**: the shopper is refused at placement and
  told the available quantity.
- **City deactivated while in cart**: a shopper holding a now-inactive city is asked to
  choose another before placing the order.
- **Delivery fee or minimum changed mid-cart**: the values current at placement govern, and
  the shopper sees them before commitment.
- **Empty cart submission**: refused.
- **Duplicate submission**: a shopper double-taps the place-order control or resubmits the
  form. Exactly one order is created.
- **Overlapping promotions on one product**: exactly one discount applies — the one most
  favourable to the customer — and discounts never compound.
- **Discount exceeding price**: a promotion that would drive a price to or below zero is
  clamped so that no line price is negative.
- **Language switch mid-checkout**: the cart, the entered form values and the current step
  all survive the switch.
- **Product missing an English photo caption or description**: the storefront falls back to
  the other language for that field rather than rendering an empty region — but the admin
  still refuses to save a product missing a required name in either language.
- **Session expiry during checkout**: the shopper is asked to sign in again and returns to
  their cart intact.
- **Customer cancels at the same moment staff confirm**: exactly one of the two takes
  effect; the other is refused and told the order has already moved on.
- **Staff account deactivated**: their existing history entries remain intact and
  attributed; they can perform no further transitions.
- **Very long Arabic address or landmark text**: stored and displayed without truncation
  that would make the address unusable to a driver.
- **Order delivered near midnight**: an order placed at 23:50 and delivered at 00:10 must fall
  on the correct business day in reports — day boundaries follow Egypt local time, not UTC, or
  every daily figure shifts by hours.
- **Order status changes after a report was read**: a report is a snapshot of the moment it was
  run. Re-running the same range later may legitimately differ if orders moved status in
  between, and the report states the moment it was generated.
- **Product renamed or deleted after selling**: product reports still show what was sold, using
  the name recorded on the order, so history stays readable.
- **Staff member downloads a report**: the file contains no cost, margin or profit column at
  all — not a blanked or zeroed one.
- **Report range covering a period with no orders**: the user is told the range is empty rather
  than handed a file with headers and no rows.
- **Very large date range**: a multi-year range still returns without the page failing, and the
  user is warned before a very large file is generated.
- **Shopper on a slow or intermittent connection**: an interrupted order submission does not
  produce a partially recorded order — either the whole order exists or none of it does.

## Requirements *(mandatory)*

### Functional Requirements

**Language and presentation**

- **FR-001**: The system MUST present all interface text and product content in Arabic and
  English, defaulting to Arabic for a visitor with no stated preference.
- **FR-002**: The system MUST render a full right-to-left layout when Arabic is active and a
  left-to-right layout when English is active.
- **FR-003**: Users MUST be able to switch language at any point without losing session,
  cart contents, entered form data, or position in a flow.
- **FR-004**: The system MUST persist a returning visitor's language choice across visits.
- **FR-005**: The system MUST store both an Arabic and an English value for every
  customer-visible name and description in master data.
- **FR-006**: The system MUST display prices in Egyptian Pounds formatted per the active
  locale.

**Customer identity**

- **FR-007**: The system MUST allow a person to register with full name, mobile number,
  city, delivery address, landmark, and password, and MUST require all of these.
- **FR-008**: The system MUST NOT require, collect, or verify an email address, and MUST NOT
  send a verification code by any channel.
- **FR-009**: The system MUST reduce any accepted Egyptian mobile number notation to one
  canonical stored form, and MUST treat notational variants of the same number as identical.
- **FR-010**: The system MUST reject values that are not valid Egyptian mobile numbers.
- **FR-011**: The system MUST refuse registration of a mobile number already in use.
- **FR-012**: The system MUST authenticate returning customers by mobile number and
  password.
- **FR-013**: The system MUST store passwords such that they cannot be recovered in plain
  form, and MUST enforce a minimum password strength at registration.
- **FR-014**: The system MUST limit the rate of failed sign-in attempts against a single
  mobile number.
- **FR-015**: Customers MUST be able to hold multiple delivery addresses, each with its own
  city and landmark, and to designate one as default.
- **FR-016**: The system MUST provide a staff-mediated password reset, recorded in the audit
  trail, since no out-of-band recovery channel exists.

**Catalog and discovery**

- **FR-017**: The system MUST let shoppers browse products by category without signing in.
- **FR-018**: The system MUST support categories arranged hierarchically to at least two
  levels.
- **FR-019**: The system MUST let shoppers search products by name, description and brand in
  either language.
- **FR-020**: The system MUST provide a view listing all products currently discounted.
- **FR-021**: The system MUST show, for each product, its photos, both-language name and
  description, brand, category, unit type, pack size and current price.
- **FR-022**: The system MUST indicate when a product is out of stock and MUST prevent it
  being ordered.
- **FR-023**: The system MUST paginate or incrementally load listings that exceed one screen.

**Cart and pricing**

- **FR-024**: Shoppers MUST be able to add products to a cart, change quantities, and remove
  items, and the cart MUST survive page navigation and browser restart.
- **FR-025**: The system MUST compute every price, discount, line total, delivery fee and
  grand total on the server from stored data.
- **FR-026**: The system MUST ignore any price, discount, fee or total value submitted by a
  client.
- **FR-027**: The system MUST apply exactly one promotion per product — the one most
  favourable to the customer where several are eligible — and MUST NOT compound discounts.
- **FR-028**: The system MUST apply a promotion only when the moment of pricing falls within
  its start and end dates.
- **FR-029**: The system MUST clamp any discounted price at or above zero.
- **FR-030**: The system MUST add the delivery fee of the order's destination city to the
  order total.
- **FR-031**: The system MUST refuse an order whose item subtotal is below the destination
  city's minimum order value, stating the shortfall.
- **FR-032**: The system MUST enforce each product's minimum order quantity.
- **FR-033**: The system MUST refuse an order for a quantity exceeding available stock.
- **FR-034**: The system MUST record the price of each line as charged at placement, so that
  later price changes do not alter historical orders.
- **FR-035**: The system MUST show the shopper any change in price, discount, fee or
  availability that occurred since they built their cart, before the order is committed.

**Order placement**

- **FR-036**: The system MUST require a signed-in customer to place an order.
- **FR-037**: The system MUST record an order as an all-or-nothing unit — a partially
  recorded order MUST NOT be possible.
- **FR-038**: The system MUST create exactly one order from a duplicated submission.
- **FR-039**: The system MUST assign each order a reference that is meaningful to staff and
  customers on the phone.
- **FR-040**: The system MUST record, with each order, the destination address including its
  landmark, as it stood at placement.
- **FR-041**: The system MUST set every new order's state to *submitted*.
- **FR-042**: The system MUST NOT collect, store or transmit any payment instrument
  information, and MUST present cash on delivery as the only settlement method.
- **FR-043**: The system MUST decrement available stock in the same all-or-nothing unit as
  the order record.

**Order lifecycle**

- **FR-044**: The system MUST support the states submitted, confirmed, preparing, out for
  delivery, delivered, cancelled and returned.
- **FR-045**: The system MUST permit only these transitions: submitted → confirmed;
  confirmed → preparing; preparing → out for delivery; out for delivery → delivered;
  delivered → returned; and cancellation from submitted, confirmed or preparing. All other
  transitions MUST be refused.
- **FR-046**: The system MUST append an immutable record of every state change capturing the
  previous state, the new state, the actor and the time.
- **FR-047**: The system MUST prevent any user from altering or deleting a historical state
  record.
- **FR-048**: Customers MUST be able to cancel their own order while, and only while, it
  remains *submitted*.
- **FR-049**: Staff MUST be able to attach a note to a state change, particularly for
  cancellation and return.
- **FR-050**: The system MUST resolve a simultaneous customer cancellation and staff
  transition so that exactly one takes effect.

**Administration**

- **FR-051**: Staff MUST be able to create and edit products with name, description,
  category, brand, price, unit type, pack size, units per carton, weight, barcode, SKU,
  stock quantity, minimum order quantity, storage type and multiple photos — all without
  code changes or deployment.
- **FR-052**: The system MUST support the unit types piece, kilo, carton, pack and litre, and
  the storage types ambient, chilled and frozen.
- **FR-053**: Staff MUST be able to create, edit, reorder and deactivate categories and
  brands.
- **FR-054**: Staff MUST be able to upload, reorder, designate a primary among, and delete
  product photos.
- **FR-055**: Staff MUST be able to create promotions with a discount, a start date and an
  end date, scoped to a product, a category, a brand, or the whole catalog.
- **FR-056**: Staff MUST be able to create and edit delivery cities, each with its own
  delivery fee and minimum order value, and to deactivate a city.
- **FR-057**: The system MUST refuse to save master data missing a required value in either
  language.
- **FR-058**: Staff MUST be able to view all orders, filter them by state, city and date, and
  search them by reference or customer phone.
- **FR-059**: The system MUST record a cost price per product that is visible to staff only.
- **FR-060**: The system MUST distinguish at least two staff capability levels, so that
  ordinary staff can process orders while catalog, pricing and cost data remain restricted
  to administrators.
- **FR-061**: The system MUST prevent deletion of any record referenced by an existing order,
  offering deactivation instead.

**Access control and privacy**

- **FR-062**: The system MUST prevent any customer from reading or modifying another
  customer's profile, addresses, orders, order lines or order history, by any route.
- **FR-063**: The system MUST prevent customers from accessing cost price or margin
  information under any circumstance.
- **FR-064**: The system MUST deny non-staff users access to every administrative function
  and MUST return no administrative data to them.
- **FR-065**: The system MUST enforce these restrictions at the data layer, so that a fault
  in a single screen or route cannot expose data.
- **FR-066**: The system MUST NOT expose privileged credentials to the browser.

**Reporting and analytics**

- **FR-070**: The system MUST provide a dashboard summarizing business performance over a
  user-chosen date range.
- **FR-071**: The dashboard MUST report, for the chosen range: revenue, order count, average
  order value, items sold, delivered order count, cancelled order count, returned order count,
  and the cancellation and return rates.
- **FR-072**: The system MUST count as revenue only orders that reached *delivered*, and MUST
  report cancelled and returned orders separately rather than folding them into revenue.
- **FR-073**: The system MUST group all time-based figures by day, week or month in **Egypt
  local time**, so that a day's figures match the business day staff worked.
- **FR-074**: The system MUST report sales broken down by product, category, brand, city and
  day.
- **FR-075**: The system MUST report customer figures: new customers, returning customers,
  total registered customers, and the customers who order most.
- **FR-076**: The system MUST report promotion performance: orders and revenue attributable to
  each promotion, and the total discount given.
- **FR-077**: The system MUST list products below a configurable stock threshold.
- **FR-078**: The system MUST make cost, margin and profit figures visible **only** to
  administrators, and MUST exclude them from every report surface and every downloadable file
  available to any other role.
- **FR-079**: Users MUST be able to download any report they can see, as CSV and as an Excel
  file.
- **FR-080**: Downloaded files MUST render Arabic text correctly when opened in common
  spreadsheet software.
- **FR-081**: A downloaded file MUST contain the same rows and totals as the report shown on
  screen for the same date range and filters.
- **FR-082**: The system MUST compute all report aggregates on the server from stored order
  data, never from figures supplied by a client.
- **FR-083**: The system MUST tell the user when a chosen range contains no data, rather than
  producing an empty or misleading file.
- **FR-084**: The system MUST produce report downloads of at least several thousand rows
  without failing.
- **FR-085**: The system MUST record report exports containing customer or financial detail in
  the audit trail, capturing who exported what and when.

**Operation**

- **FR-067**: The system MUST operate within the free service tiers of its hosting and data
  platforms at expected volumes.
- **FR-068**: The system MUST constrain stored image size by re-encoding uploads to
  storefront-appropriate dimensions.
- **FR-069**: The system MUST remain reachable without manual intervention despite provider
  inactivity-suspension behaviour.

### Key Entities

- **Customer**: A person who orders. Holds full name, canonical mobile number, password
  credential, preferred language, and account state. Owns addresses and orders.
- **Address**: A delivery destination belonging to one customer. Holds city, street address,
  landmark, optional building and floor detail, and whether it is the customer's default.
- **City**: A place the fleet delivers to. Holds bilingual name, delivery fee, minimum order
  value, and whether it is currently served.
- **Category**: A bilingual grouping of products, optionally nested under a parent category,
  with a display order and an active flag.
- **Brand**: A bilingual manufacturer or label, with an optional logo and an active flag.
- **Product**: A sellable grocery item. Holds bilingual name and description, category,
  brand, selling price, unit type, pack size, units per carton, weight, barcode, SKU, stock
  quantity, minimum order quantity, storage type, active flag, and an ordered set of photos.
- **Product Cost**: The confidential purchase cost of a product, readable only by
  administrators, deliberately separate from the product record customers can reach.
- **Product Photo**: An image belonging to a product, with a position and a primary
  designation.
- **Promotion**: A time-bounded price reduction. Holds a discount expressed either as a
  percentage or a fixed amount, a start and end date, a scope identifying the products it
  covers, and an active flag.
- **Cart**: A shopper's working set of product references and quantities prior to placing an
  order. Holds no prices — prices are always derived.
- **Order**: A captured purchase. Holds its reference, the customer, a snapshot of the
  delivery address including landmark, the destination city, the item subtotal, the total
  discount, the delivery fee, the grand total, the current state, and the time it was
  placed.
- **Order Line**: One product within an order, holding the quantity and the unit price,
  discount and line total as charged at placement, plus a snapshot of the product's name and
  unit so the order remains readable if the product later changes.
- **Order Status History**: An append-only record of one state change on one order, holding
  the previous state, the new state, the acting person, an optional note, and the time.
- **Staff Member**: An employee with a capability level determining whether they may process
  orders only, or also manage catalog, pricing and cost data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time shopper on a phone can go from landing on the site to a placed
  order — including registration — in under 5 minutes.
- **SC-002**: A returning signed-in shopper can reorder a familiar basket of 10 items and
  place the order in under 3 minutes.
- **SC-003**: On a mid-range Android phone over a typical Egyptian mobile connection, the
  category listing becomes readable within 3 seconds of tapping it.
- **SC-004**: 95% of catalog searches return results within 1 second.
- **SC-005**: Every price, discount and total a customer is shown at checkout matches the
  amount recorded on the order in 100% of orders.
- **SC-006**: No order can be created carrying a price, fee or total that differs from what
  the system's own data produces, under adversarial attempts to submit altered values.
- **SC-007**: Attempts by one customer to read another customer's orders, addresses or
  profile fail in 100% of cases across every access route.
- **SC-008**: Cost price information is unreachable by every non-administrator role in 100%
  of attempts.
- **SC-009**: A staff member with no technical background can add a complete new product,
  including photos and both languages, in under 5 minutes without assistance.
- **SC-010**: 100% of order state changes carry an intact history entry naming the actor and
  the time.
- **SC-011**: Invalid state transitions are refused in 100% of attempts.
- **SC-012**: The interface renders correctly with no horizontal overflow at a 360-pixel
  viewport width in both Arabic and English.
- **SC-013**: Switching language preserves cart contents and form input in 100% of attempts.
- **SC-014**: Monthly infrastructure cost remains at zero at a volume of 1,000 registered
  customers, 2,000 products and 3,000 orders per month.
- **SC-015**: Customer-facing "where is my order" phone calls fall by 50% within two months
  of launching self-service order tracking.
- **SC-016**: Concurrent orders for the last unit of stock result in exactly one successful
  order in 100% of trials.
- **SC-017**: Every dashboard and report figure reconciles exactly against the underlying orders
  in 100% of checks.
- **SC-018**: Cost, margin and profit figures are absent from every report surface and every
  downloadable file available to non-administrators, in 100% of attempts.
- **SC-019**: The dashboard renders a full month of figures within 2 seconds.
- **SC-020**: A 5,000-row report downloads successfully, and its Arabic text displays correctly
  when the file is opened in Excel.
- **SC-021**: An owner can answer "what did we sell last month, and which products led" within
  60 seconds of opening the dashboard.

## Assumptions

- **Market and scale**: Egypt only, Egyptian Pounds only, a single warehouse and an in-house
  fleet. Planning volume is on the order of 1,000 customers, 2,000 products and 3,000 orders
  per month — comfortably inside free service tiers.
- **Delivery**: The fleet's scheduling, routing and driver assignment happen outside this
  system. The site captures orders and exposes their state; it does not dispatch.
- **Payment**: Cash is collected by the driver on delivery. No settlement, reconciliation or
  refund processing is in scope.
- **Password recovery**: With no email and no SMS, a customer who forgets their password
  must be reset by staff over the phone. This is accepted as the cost of the "free to run"
  constraint, and identity is confirmed verbally by the staff member.
- **Phone numbers**: Customers hold Egyptian mobile numbers. Landline-only customers are out
  of scope.
- **Stock**: A single stock quantity per product, adjusted by staff and decremented on order
  placement. There is no reservation window, no multi-location inventory, and no automatic
  replenishment.
- **Promotions**: Percentage or fixed-amount reductions on a scope of products for a date
  range. Coupon codes, buy-one-get-one, customer-segment targeting and free-delivery
  promotions are out of scope for this release.
- **Delivery scheduling**: Customers do not choose a delivery time slot in this release;
  staff arrange timing during the confirmation call.
- **Notifications**: No SMS, email or push notification is sent. Customers learn of progress
  by opening the site, and staff communicate by phone.
- **Guest checkout**: Not supported — an order needs an identified customer with a reachable
  phone number.
- **Content fallback**: If an optional description is present in only one language, the
  storefront shows the available language rather than an empty region. Names are mandatory in
  both languages.
- **Returns**: A returned order is a state recorded for the record. Refund handling is a cash
  matter settled outside the system.
- **Reporting**: A dashboard and downloadable reports are in scope (User Story 7). All figures
  derive from order data already captured — no separate analytics collection, no page-view or
  funnel tracking, and no third-party analytics service. Reporting is descriptive: it reports
  what happened and does not forecast.
- **Reporting timezone**: All date grouping uses Egypt local time, so a "day" in a report is the
  business day staff actually worked.
- **Revenue definition**: Revenue means delivered orders. Orders still in progress are reported
  separately as booked-but-not-yet-delivered; cancelled and returned orders are reported as
  losses rather than netted silently into revenue.
- **Report volume**: Reports cover the business's own order history at the stated scale —
  thousands of orders per month, not millions of rows.
- **Staff accounts**: Created by an administrator, not self-registered.
- **Browsers**: Recent Chrome, Safari and Samsung Internet on Android and iOS, plus current
  desktop browsers. Legacy browsers are out of scope.
