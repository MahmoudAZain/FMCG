import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { put } from "@vercel/blob";

export const runtime = "nodejs";

// Vercel caps serverless function request bodies at 4.5 MB, so uploads are
// routed through this function only up to that size. Reject anything larger
// with a clear message instead of letting the platform return an opaque 413.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const filename = searchParams.get("filename") || `upload-${Date.now()}`;

  if (!req.body) return NextResponse.json({ error: "No file provided." }, { status: 400 });

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "Image is larger than 4 MB. Please resize it and try again." },
      { status: 413 }
    );
  }

  const blob = await put(`products/${Date.now()}-${filename}`, req.body, {
    access: "public",
  });

  return NextResponse.json({ url: blob.url });
}
