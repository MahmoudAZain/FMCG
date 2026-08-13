import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const CATEGORIES = ["Beverages", "Oil & Ghee", "Sauces", "Seasonings", "Pasta", "Frozen", "Coffee and Tea"];

const BRANDS = ["Wadi Food", "Juhayna", "Heinz", "Knorr", "Pepsi", "Nestle", "Lipton"];

async function main() {
  // Admin account — CHANGE THIS PASSWORD before going live.
  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@yourcompany.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      companyName: "Platform Admin",
      role: "ADMIN",
      approved: true,
    },
  });

  const categoryRecords: Record<string, string> = {};
  for (const name of CATEGORIES) {
    const c = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name, slug: slugify(name) },
    });
    categoryRecords[name] = c.id;
  }

  const brandRecords: Record<string, string> = {};
  for (const name of BRANDS) {
    const b = await prisma.brand.upsert({
      where: { name },
      update: {},
      create: { name, slug: slugify(name) },
    });
    brandRecords[name] = b.id;
  }

  const sampleProducts = [
    { sku: "WF-OL-250", name: "Extra Virgin Olive Oil 250ml", brand: "Wadi Food", category: "Oil & Ghee", unitsPerCarton: 12, cartonPrice: 3411, stockCartons: 40 },
    { sku: "HZ-KTC-20", name: "Tomato Ketchup 20kg Bag-in-Box", brand: "Heinz", category: "Sauces", unitsPerCarton: 1, cartonPrice: 2450, stockCartons: 15 },
    { sku: "KN-CHK-1KG", name: "Chicken Stock Powder 1kg", brand: "Knorr", category: "Seasonings", unitsPerCarton: 6, cartonPrice: 1180, stockCartons: 25 },
    { sku: "PP-COLA-330", name: "Pepsi Cola Can 330ml", brand: "Pepsi", category: "Beverages", unitsPerCarton: 24, cartonPrice: 264, stockCartons: 120 },
    { sku: "JH-MLK-1L", name: "Full Cream Milk 1L", brand: "Juhayna", category: "Beverages", unitsPerCarton: 12, cartonPrice: 384, stockCartons: 60 },
    { sku: "LP-TEA-100", name: "Yellow Label Tea Bags 100ct", brand: "Lipton", category: "Coffee and Tea", unitsPerCarton: 12, cartonPrice: 960, stockCartons: 30 },
    { sku: "NS-COF-200", name: "Instant Coffee 200g", brand: "Nestle", category: "Coffee and Tea", unitsPerCarton: 12, cartonPrice: 1740, stockCartons: 22 },
  ];

  for (const p of sampleProducts) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        sku: p.sku,
        name: p.name,
        brandId: brandRecords[p.brand],
        categoryId: categoryRecords[p.category],
        unitsPerCarton: p.unitsPerCarton,
        cartonPrice: p.cartonPrice,
        stockCartons: p.stockCartons,
        active: true,
      },
    });
  }

  console.log("Seed complete.");
  console.log(`Admin login: ${adminEmail} / ${adminPassword}`);
}

function slugify(s: string) {
  return s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
