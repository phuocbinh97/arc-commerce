import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

// GET /api/invoices/lookup?invoiceId=INV-005
export async function GET(req: NextRequest) {
  const invoiceId = req.nextUrl.searchParams.get("invoiceId");
  if (!invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
  const raw: string | null = await redis.get(`invoice:${invoiceId}`);
  if (!raw) return NextResponse.json({ invoice: null });
  const invoice = typeof raw === "string" ? JSON.parse(raw) : raw;
  return NextResponse.json({ invoice });
}
