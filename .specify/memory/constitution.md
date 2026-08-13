<!--
SYNC IMPACT REPORT
==================
Version change: (none) → 1.0.0
Rationale: Initial ratification. All principles newly defined.

Modified principles: n/a (initial adoption)

Added sections:
  - Core Principles (7 principles)
    I.   Server-Authoritative Commerce (NON-NEGOTIABLE)
    II.  Tenant-of-One Data Isolation (NON-NEGOTIABLE)
    III. Bilingual & RTL by Construction
    IV.  Mobile-First on Egyptian Mobile Data
    V.   Zero-Cost Operations
    VI.  Staff Autonomy Over Master Data
    VII. Auditable Order Lifecycle
  - Technology & Operating Constraints
  - Development Workflow & Quality Gates
  - Governance

Removed sections: none

Follow-up TODOs: none
-->

# FMCG Egypt Grocery Commerce Constitution

The project delivers a bilingual (Arabic-default, English-secondary) grocery
e-commerce storefront and staff admin console for the Egyptian market. Orders are
cash-on-delivery and fulfilled by an in-house delivery fleet. The software's job is
to **capture correct orders cheaply and safely** — nothing more.

## Core Principles

### I. Server-Authoritative Commerce (NON-NEGOTIABLE)

Every price, discount, delivery fee, minimum-order threshold, stock decrement, and
order total MUST be computed on the server from database state at the moment of the
transaction. The browser MAY send product identifiers and quantities; it MUST NOT
send prices, totals, discount amounts, or fee values, and any such field arriving
from a client MUST be discarded rather than validated.

Order placement MUST execute as a single database transaction that re-reads current
prices and active promotions, enforces stock and minimum-quantity rules, and writes
an immutable price snapshot onto the order lines.

**Rationale**: Cash-on-delivery means the driver collects whatever the order says.
A tampered total is a direct, unrecoverable cash loss with no payment processor to
reverse it.

### II. Tenant-of-One Data Isolation (NON-NEGOTIABLE)

Authorization MUST be enforced in the database through Row Level Security on every
table containing customer or commercial data. Application-layer checks are a usability
affordance, never the security boundary; a route that forgets its check MUST still
return nothing.

Two isolation rules are absolute:

- A customer MUST NOT be able to read, modify, or enumerate another customer's
  profile, addresses, orders, order lines, or order history.
- Cost prices and supplier margin data MUST NOT be reachable by any customer-facing
  role. Cost data MUST live in storage that customer roles have no grant on at all,
  rather than relying on queries that merely omit the column.

Every new table ships with RLS enabled and an explicit policy set in the same change
that creates it. A table with RLS disabled MUST NOT reach the default branch.

**Rationale**: A leaked order list exposes customer names, phones, and home addresses.
A leaked cost sheet hands competitors the business.

### III. Bilingual & RTL by Construction

Arabic is the default language and the default layout direction. English is a
first-class alternate, not a fallback. Requirements:

- Every customer-visible content record MUST carry both an Arabic and an English
  value; the admin MUST refuse to save master data missing either language.
- Layout MUST use direction-agnostic CSS logical properties (inline-start/inline-end,
  margin-inline, padding-block). Physical `left`/`right` properties are prohibited in
  layout code except where a value is genuinely direction-independent.
- Language choice MUST be switchable at any point without losing cart contents,
  form input, or the current page.
- Numerals, currency, and dates MUST render per the active locale, and the stored
  value MUST remain locale-independent.

**Rationale**: Retrofitting RTL is a rewrite. Building it in costs nothing.

### IV. Mobile-First on Egyptian Mobile Data

The primary target is a mid-range Android phone on a metered 3G/4G connection.

- Every screen MUST be designed at a 360px-wide viewport first; desktop is the
  adaptation.
- Product imagery MUST be served in a modern compressed format at
  device-appropriate dimensions, lazily loaded below the fold.
- Interactive controls MUST have a touch target of at least 44x44 CSS pixels.
- Catalog and cart flows MUST remain usable on a slow connection: server-render the
  first paint, and never block the primary content on a non-essential request.

**Rationale**: Customers pay for the bytes we ship them. Waste costs us conversions.

### V. Zero-Cost Operations

The system MUST run within the Supabase and Cloudflare free tiers at the project's
expected scale. Consequences that bind design:

- No paid third-party service may become a hard dependency. No SMS gateway, no
  transactional email provider, no payment gateway, no external image CDN.
- Any dependency added to the runtime MUST be justified against bundle size and
  request volume.
- Storage growth MUST be bounded: uploaded images are resized and re-encoded before
  they reach the bucket, and orphaned assets are reclaimable.
- Scheduled work MUST fit the free scheduler allowance, including the keep-alive
  needed to prevent free-tier database pausing.

**Rationale**: The margin on groceries is thin. Infrastructure that costs money
must earn it first.

### VI. Staff Autonomy Over Master Data

Non-technical staff MUST be able to run the catalog and the delivery footprint
entirely through the admin UI. Adding a product, category, brand, promotion, or
delivery city — and changing any price, stock level, or fee — MUST NOT require a code
change, a deployment, or database access.

Anything a staff member can break through the admin MUST be validated at the database
level, not merely in the form.

**Rationale**: A catalog that needs a developer is a catalog that goes stale.

### VII. Auditable Order Lifecycle

Orders move through a fixed set of states: submitted → confirmed → preparing →
out for delivery → delivered, with cancelled and returned as terminal exits.

- Legal transitions MUST be enforced by the database. An illegal transition is
  rejected, not logged and accepted.
- Every status change MUST append an immutable history row recording the previous
  state, the new state, the actor, and the timestamp. History rows are never updated
  or deleted.
- A customer MAY cancel their own order only while it is still `submitted`. After
  staff confirmation, only staff may change state.

**Rationale**: When a driver and a customer disagree about an order, the log is the
only evidence that exists.

## Technology & Operating Constraints

**Fixed stack**: Next.js (App Router) deployed to Cloudflare; Supabase Postgres for
data, Supabase Auth for identity, Supabase Storage for images. Substituting any of
these is a constitutional amendment, not a technical decision.

**Identity**: Customers authenticate with an Egyptian mobile number and a password.
There is no SMS verification, no email verification, and no email address collected.
Phone numbers MUST be normalized to a single canonical form before storage or
comparison. Because there is no out-of-band channel, password recovery is a
staff-mediated operation performed through the admin console and recorded in the
audit trail.

**Money**: All monetary values MUST be stored as integer minor units (piastres).
Floating-point types MUST NOT be used for money anywhere in the stack — database,
API, or client.

**Payments**: Cash on delivery only. The system MUST NOT collect, store, or transmit
card data, and MUST NOT integrate a payment gateway. Order capture ends the software's
responsibility; the fleet takes over.

**Data residency of secrets**: Service-role credentials MUST NOT be exposed to the
browser or embedded in client bundles. Privileged operations run server-side only.

## Development Workflow & Quality Gates

**Specification first**: Features enter through Spec Kit — specify, plan, tasks — before
implementation. The spec defines behavior; the plan defines structure; tasks define
order.

**Migrations**: Schema changes are versioned SQL migrations committed to the
repository. The database is never modified by hand in a way the repository cannot
reproduce from empty.

**Gates before merge**: A change MUST NOT merge unless it (a) type-checks and lints
clean, (b) ships RLS policies for any table it creates, (c) keeps prices and totals
computed server-side, (d) supplies both language values for any new customer-visible
content field, and (e) renders correctly at 360px width in both LTR and RTL.

**Testing posture**: Automated coverage is required for the pricing engine, the order
placement transaction, the status transition rules, and the RLS isolation guarantees —
the four places where a defect costs money or leaks data. Elsewhere, tests are
encouraged and not mandated.

**Review**: Every change is reviewed against these principles. A reviewer citing a
principle number blocks the merge until the concern is resolved or the constitution is
amended.

## Governance

This constitution supersedes ad-hoc practice. Where a convenience conflicts with a
principle, the principle wins.

**Amendments** require a written proposal stating the principle affected, the
motivating problem, and the migration path for existing code. An amendment is adopted
by the project owner and takes effect when merged with a version bump and an updated
Sync Impact Report.

**Versioning** follows semantic versioning:

- **MAJOR** — a principle is removed or redefined in a way that invalidates existing
  compliant code.
- **MINOR** — a principle or governing section is added, or existing guidance is
  materially expanded.
- **PATCH** — clarification, wording, or typo correction with no change in obligation.

**Compliance review** happens at every code review and at the close of each feature's
Spec Kit cycle. Principles I and II are non-negotiable: a violation of either is a
release blocker regardless of schedule. Violations of other principles MUST be recorded
in the feature plan's Complexity Tracking table with the justification and the simpler
alternative that was rejected.

**Version**: 1.0.0 | **Ratified**: 2026-08-13 | **Last Amended**: 2026-08-13
