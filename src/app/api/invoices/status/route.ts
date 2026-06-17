import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

// GET /api/invoices/status?invoiceId=INV-001
export async function GET(req: NextRequest) {
  const invoiceId = req.nextUrl.searchParams.get("invoiceId");
  if (!invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });

  const raw: string | null = await redis.get(`invoice:${invoiceId}`);
  if (!raw) {
    // Not in Redis — unknown, allow payment to proceed
    return NextResponse.json({ status: "unknown" });
  }
  const inv = typeof raw === "string" ? JSON.parse(raw) : raw;

  // Check expiry
  if (inv.status === "pending" && inv.expiresAt && Date.now() > inv.expiresAt) {
    return NextResponse.json({ status: "expired" });
  }

  return NextResponse.json({ status: inv.status });
}
