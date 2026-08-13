# Wholesale Buyer Portal

B2B FMCG buyer portal: catalog with carton pricing hidden until sign-in, cart, checkout,
buyer self-registration, and an admin panel to add products one at a time or bulk-import
price/stock updates via Excel/CSV.

Next.js 14 (App Router) · Prisma · PostgreSQL · NextAuth · Tailwind · Vercel Blob

---

## Deploying to Vercel

### 1. Create the database

Vercel dashboard → **Storage** → **Create Database** → **Postgres** (Neon-backed). Any
Postgres works (Neon, Supabase, Railway); it does not have to be Vercel's.

You need **two** connection strings:

| Env var        | Which string                        | Used for                    |
| -------------- | ----------------------------------- | --------------------------- |
| `DATABASE_URL` | **pooled** (pgbouncer)              | the app at runtime          |
| `DIRECT_URL`   | **direct / unpooled**               | running migrations          |

Serverless functions open many short-lived connections, so the runtime URL must be the
pooled one or the app will hit `too many connections` under load. Migrations cannot run
through a pooler, which is why the direct URL is separate. Vercel/Neon expose the direct
string as `DATABASE_URL_UNPOOLED` or `POSTGRES_URL_NON_POOLING`. **If your provider has no
separate direct URL, set `DIRECT_URL` to the same value as `DATABASE_URL`.**

### 2. Push this repo to GitHub, then import it in Vercel

Vercel auto-detects Next.js — no build settings to change. The app lives at the repo root.

### 3. Set environment variables in Vercel

Project → Settings → Environment Variables (set for Production *and* Preview):

| Variable                | Required | Notes                                            |
| ----------------------- | -------- | ------------------------------------------------ |
| `DATABASE_URL`          | yes      | pooled connection string                         |
| `DIRECT_URL`            | yes      | direct connection string (see above)             |
| `NEXTAUTH_SECRET`       | yes      | generate with `openssl rand -base64 32`          |
| `BLOB_READ_WRITE_TOKEN` | for photos | auto-injected once you connect a Blob store    |
| `NEXTAUTH_URL`          | no       | leave unset on Vercel — see below                |

Do **not** set `NEXTAUTH_URL` on Vercel. NextAuth infers the URL from `VERCEL_URL`;
hardcoding it breaks sign-in on preview deployments, since every preview gets its own
hostname. Set it only for local development, or if you serve from a custom domain and
sign-in redirects misbehave.

### 4. Deploy

The build command is:

```
prisma generate && prisma migrate deploy && next build
```

`prisma migrate deploy` applies `prisma/migrations/` to the production database on every
deploy, so **the schema is created automatically on the first deploy** — no manual step.
It is a no-op when the database is already up to date.

### 5. Check the deployment

Visit **`/api/health`** on your deployed site. It reports which parts of the setup are
wired up and what to do about anything that is not:

```json
{
  "status": "setup",
  "checks": {
    "databaseUrlSet": true,
    "directUrlSet": true,
    "nextauthSecretSet": true,
    "blobTokenSet": false,
    "databaseReachable": true,
    "schemaReady": true,
    "adminUserExists": false,
    "productCount": 0
  },
  "hints": ["No admin account yet. Register at /account/register, then run: ..."]
}
```

`status` is `ok` when the site is fully set up, `setup` when it works but still needs an
admin account or a catalog, and `error` (HTTP 503) when something is actually broken. It
reports only booleans and counts, never the value of an environment variable, so the
output is safe to paste when asking for help.

### 6. Create your first admin login (one time)

The seed script is not part of the build (it would re-run on every deploy). Run it once
from your machine, pointed at the production database:

```bash
DATABASE_URL="<production pooled URL>" \
DIRECT_URL="<production direct URL>" \
SEED_ADMIN_EMAIL="you@yourcompany.com" \
SEED_ADMIN_PASSWORD="<a strong password>" \
npm run seed
```

This creates the admin account plus a handful of sample products. Sign in at
`/account/login`, then go to `/admin/products` and replace the samples with your real
catalog — bulk import is the fastest way.

### 7. Load your real catalog

`/admin/products/import` accepts Excel/CSV with columns:

```
sku, name, brand, category, unitsPerCarton, cartonPrice, stockCartons, imageUrl (optional)
```

Re-upload the same file whenever prices or stock change — it matches on `sku` and updates
in place; new SKUs are created automatically. See `sample-import-template.csv`.

---

## Local development

```bash
npm install
cp .env.example .env
# fill in DATABASE_URL, DIRECT_URL, NEXTAUTH_SECRET

npm run db:migrate   # apply migrations to your local database
npm run seed         # sample products + your first admin login
npm run dev
```

Visit `localhost:3000`.

### Changing the data model

Edit `prisma/schema.prisma`, then:

```bash
npm run db:migrate -- --name describe_your_change
```

Commit the generated folder under `prisma/migrations/` — that is what `prisma migrate
deploy` replays in production. Do not use `prisma db push` on a database that has
migrations applied; the two approaches will fight each other.

---

## Known limitations

- **`xlsx@0.18.5`** (bulk import) carries unpatched advisories — prototype pollution
  (CVE-2023-30533) and ReDoS (CVE-2024-22363). No fixed version is published to npm; the
  vendor ships fixes via their own registry. Only signed-in admins can upload files, which
  bounds the exposure. To take the fix:
  `npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
- **Product photo uploads are capped at 4 MB.** Vercel limits serverless request bodies to
  4.5 MB. Larger images are rejected with a clear message rather than an opaque `413`. To
  lift the cap, switch to Vercel Blob client-side uploads (`handleUpload`) — note that
  client uploads need a publicly reachable callback URL, so they do not work against
  `localhost`.
- **No payment step** — checkout creates a purchase order (net terms / invoice model).
- **No email notifications** on order placement or status change.
- **Catalog filters by brand/category only**, no full-text search.
- **English only** — no AR/EN bilingual support yet.
- Buyers are **approved instantly**. The `User.approved` field already exists and is
  enforced at sign-in; to switch to manual approval, default new signups to
  `approved: false` in `app/api/auth/register/route.ts` and add an admin screen to flip it.

## Project structure

- `app/products` — storefront catalog (server-rendered, price hidden unless logged in)
- `app/cart`, `app/checkout` — client-side cart (localStorage) → order creation
- `app/account` — buyer login/register, order detail
- `app/admin` — product CRUD, bulk import, order management
- `app/api/health` — deployment diagnostics (see step 5)
- `middleware.ts` — first-pass gate on `/admin/*`
- `app/admin/layout.tsx` — authoritative server-side admin check (see note below)
- `prisma/schema.prisma` — data model
- `prisma/migrations/` — migration history applied on deploy
- `prisma/seed.ts` — sample data + first admin account

### A note on admin authorization

Admin access is enforced **server-side in `app/admin/layout.tsx`**, not by middleware
alone. Middleware is not a sufficient authorization boundary — CVE-2025-29927 allowed
Next.js middleware to be skipped entirely with a crafted `x-middleware-subrequest` header.
The middleware remains as a cheap first-pass redirect, but every admin page re-checks the
session on the server, and every admin API route checks the session independently.

### A note on order integrity

`app/api/orders` treats the cart as untrusted input. Prices always come from the database,
never from the request. Quantities must be whole numbers of at least one — a negative
quantity would otherwise produce a negative order total and *increase* stock. Repeated
lines for the same product are collapsed before the stock check, so they cannot be used to
order past the available quantity one line at a time.

The stock decrement is guarded inside the `UPDATE` itself
(`where: { stockCartons: { gte: cartons } }`) rather than relying on the earlier read, so
simultaneous orders cannot oversell; the loser gets a 409 and the whole transaction rolls
back. Order numbers carry a random suffix and the insert retries on collision, since a
plain timestamp collides whenever two orders land in the same millisecond.
