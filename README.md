# FMCG — Egyptian Grocery E-Commerce

A bilingual (Arabic-default, RTL) grocery storefront and staff admin console for the Egyptian
market. Cash on delivery only, fulfilled by an in-house fleet. The site's job is to capture
correct orders cheaply and safely.

**Status**: Specification and plan complete. Implementation not yet started.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, React 19), TypeScript strict |
| Hosting | Cloudflare Workers via `@opennextjs/cloudflare` |
| Database / Auth / Storage | Supabase (Postgres 15, free tier) |
| i18n | `next-intl` — `ar` default with full RTL, `en` secondary |
| Styling | Tailwind CSS v4, logical properties only |

## Documents

Planned with [GitHub Spec Kit](https://github.com/github/spec-kit). Read in this order:

| Document | What it covers |
|---|---|
| [Constitution](.specify/memory/constitution.md) | The seven non-negotiable principles governing every change |
| [Specification](specs/001-egyptian-grocery-ecommerce/spec.md) | 6 user stories, 69 functional requirements, 16 success criteria |
| [Research](specs/001-egyptian-grocery-ecommerce/research.md) | 16 technical decisions with rationale and rejected alternatives |
| [Data model](specs/001-egyptian-grocery-ecommerce/data-model.md) | 14 tables, RLS summary, state machine |
| [Plan](specs/001-egyptian-grocery-ecommerce/plan.md) | Architecture, structure, build order, risks |
| [Tasks](specs/001-egyptian-grocery-ecommerce/tasks.md) | 104 tasks across 6 phases |
| [Quickstart](specs/001-egyptian-grocery-ecommerce/quickstart.md) | Setup, verification, deployment |

Contracts: [RPC functions](specs/001-egyptian-grocery-ecommerce/contracts/rpc-contracts.md) ·
[RLS policies](specs/001-egyptian-grocery-ecommerce/contracts/rls-policies.md) ·
[Routes and actions](specs/001-egyptian-grocery-ecommerce/contracts/routes-and-actions.md)

## The four decisions that shape everything

1. **Orders have no `INSERT` policy for any role.** The only way an order comes into existence
   is `place_order()`, a `SECURITY DEFINER` function that recomputes every amount from stored
   data under row locks. The browser sends product IDs and quantities — nothing else. Prices
   cannot be tampered with because there is no path by which a client writes one.

2. **Cost prices live in a separate table with no grant to customers or staff.** A restricted
   column would depend on every query, forever, remembering to omit it. A table nobody has a
   grant on cannot leak.

3. **All money is integer piastres.** A one-piastre floating-point drift is a cash dispute at
   the door when the driver collects.

4. **Phone-only auth with no SMS and no email.** Numbers normalize to `+201XXXXXXXXX` and map
   to a synthetic internal identifier over Supabase Auth, keeping password hashing, JWTs and
   `auth.uid()` in RLS. The trade-off — no self-service password reset — is handled by a
   staff-mediated reset with an audit trail.

## Build order

| Stage | Delivers |
|---|---|
| 1. Foundation | Next.js on Workers, Supabase project, RTL shell, CI |
| 2. Data layer | 14 tables, RLS, pricing and order functions, tests |
| 3. Storefront 🎯 | Register, browse, cart, checkout — **MVP, real orders** |
| 4. Admin | Products, categories, brands, promotions, cities |
| 5. Order operations | Staff queue and transitions; customer tracking |
| 6. Discovery | Arabic/English search, offers, scheduled jobs, hardening |

Stage 2 precedes all UI because the correctness and isolation guarantees are database-resident.
Stages 3 and 4 can run in parallel.

## Known risk

The Supabase free tier provides **no backups**. A weekly export job is planned (T095), but a
catastrophic loss is recoverable only to the last export. Point-in-time recovery requires the
$25/month Pro tier — a business decision, recorded here rather than made silently.

## Continuing the work

```bash
uvx --from git+https://github.com/github/spec-kit.git specify check
```

Spec Kit skills are installed in `.claude/skills/`. `/speckit-implement` executes
`tasks.md`; `/speckit-analyze` checks cross-artifact consistency first.
