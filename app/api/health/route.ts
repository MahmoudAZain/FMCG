import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Deployment diagnostics. Visit /api/health after deploying to see which parts
 * of the setup are wired up.
 *
 * Reports only booleans and counts — never the value of an environment
 * variable, so the output is safe to paste when asking for help.
 */
export async function GET() {
  const checks = {
    databaseUrlSet: !!process.env.DATABASE_URL,
    directUrlSet: !!process.env.DIRECT_URL,
    nextauthSecretSet: !!process.env.NEXTAUTH_SECRET,
    blobTokenSet: !!process.env.BLOB_READ_WRITE_TOKEN,
    databaseReachable: false,
    schemaReady: false,
    adminUserExists: false,
    productCount: null as number | null,
  };
  const hints: string[] = [];

  if (!checks.databaseUrlSet) hints.push("DATABASE_URL is not set. Add it in Vercel -> Settings -> Environment Variables, then redeploy.");
  if (!checks.directUrlSet) hints.push("DIRECT_URL is not set. Migrations cannot run without it. Use the non-pooled connection string.");
  if (!checks.nextauthSecretSet) hints.push("NEXTAUTH_SECRET is not set. Sign-in will fail. Generate one with: openssl rand -base64 32");
  if (!checks.blobTokenSet) hints.push("BLOB_READ_WRITE_TOKEN is not set. Everything works except product photo uploads — connect a Vercel Blob store and redeploy.");

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.databaseReachable = true;
  } catch {
    hints.push("Could not connect to the database. Check that DATABASE_URL is the pooled connection string and that it includes the correct password.");
  }

  if (checks.databaseReachable) {
    try {
      const [admins, products] = await Promise.all([
        prisma.user.count({ where: { role: "ADMIN" } }),
        prisma.product.count(),
      ]);
      checks.schemaReady = true;
      checks.adminUserExists = admins > 0;
      checks.productCount = products;

      if (admins === 0) {
        hints.push('No admin account yet. Register at /account/register, then run: UPDATE "User" SET role = \'ADMIN\' WHERE email = \'your@email.com\';');
      }
      if (products === 0) {
        hints.push("No products yet. Sign in as an admin and use /admin/products/import to load your catalog.");
      }
    } catch (e: any) {
      if (e?.code === "P2021" || /does not exist/i.test(e?.message ?? "")) {
        hints.push("Connected, but the tables are missing — `prisma migrate deploy` did not run. Check the build log for 'Applying migration 0_init', and confirm DIRECT_URL is set.");
      } else {
        hints.push("Connected, but querying failed. Check the deployment's Function logs for details.");
      }
    }
  }

  const ready = checks.databaseReachable && checks.schemaReady && checks.nextauthSecretSet;
  const status = !ready ? "error" : checks.adminUserExists ? "ok" : "setup";

  return NextResponse.json(
    { status, checks, hints },
    { status: status === "error" ? 503 : 200, headers: { "Cache-Control": "no-store" } }
  );
}
