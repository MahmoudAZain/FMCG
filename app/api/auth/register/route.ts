import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const body = await req.json();
  const { email, password, companyName, phone } = body;

  if (!email || !password || !companyName) {
    return NextResponse.json({ error: "Email, password, and company name are required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Buyers are approved instantly per current settings.
  // To require manual approval later, set approved: false here
  // and build an admin screen to flip it on.
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      companyName,
      phone,
      role: "BUYER",
      approved: true,
    },
  });

  return NextResponse.json({ id: user.id, email: user.email });
}
