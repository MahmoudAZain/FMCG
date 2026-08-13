import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

// Expected columns (header row, case-insensitive):
// sku | name | brand | category | unitsPerCarton | cartonPrice | stockCartons | imageUrl (optional)
//
// Matching rule: existing SKU -> update price/stock/name/image.
//                new SKU      -> create product (brand/category auto-created if new).

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const [i, raw] of rows.entries()) {
    const row = normalizeKeys(raw);
    const sku = String(row.sku || "").trim();
    const name = String(row.name || "").trim();
    const brandName = String(row.brand || "").trim();
    const categoryName = String(row.category || "").trim();
    const unitsPerCarton = Number(row.unitspercarton);
    const cartonPrice = Number(row.cartonprice);
    const stockCartons = Number(row.stockcartons) || 0;
    const imageUrl = row.imageurl ? String(row.imageurl).trim() : undefined;

    if (!sku || !name || !brandName || !categoryName || !unitsPerCarton || !cartonPrice) {
      errors.push(`Row ${i + 2}: missing required field(s) — skipped.`);
      continue;
    }

    try {
      const brand = await prisma.brand.upsert({
        where: { name: brandName },
        update: {},
        create: { name: brandName, slug: slugify(brandName) },
      });
      const category = await prisma.category.upsert({
        where: { name: categoryName },
        update: {},
        create: { name: categoryName, slug: slugify(categoryName) },
      });

      const existing = await prisma.product.findUnique({ where: { sku } });

      if (existing) {
        await prisma.product.update({
          where: { sku },
          data: {
            name,
            brandId: brand.id,
            categoryId: category.id,
            unitsPerCarton,
            cartonPrice,
            stockCartons,
            ...(imageUrl ? { imageUrl } : {}),
          },
        });
        updated++;
      } else {
        await prisma.product.create({
          data: {
            sku,
            name,
            brandId: brand.id,
            categoryId: category.id,
            unitsPerCarton,
            cartonPrice,
            stockCartons,
            imageUrl: imageUrl || null,
          },
        });
        created++;
      }
    } catch (e: any) {
      errors.push(`Row ${i + 2} (SKU ${sku}): ${e.message || "failed to save"}.`);
    }
  }

  return NextResponse.json({ created, updated, errors, totalRows: rows.length });
}

function normalizeKeys(row: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const key of Object.keys(row)) {
    out[key.toLowerCase().replace(/\s+/g, "")] = row[key];
  }
  return out;
}

function slugify(s: string) {
  return s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
