import { NextRequest, NextResponse } from "next/server";
import { redis, Merchant } from "@/lib/redis";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ merchantId: string }> }
) {
  const { merchantId } = await params;
  const merchant: Merchant | null = await redis.get(`merchant:${merchantId}`);
  if (!merchant) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }
  return NextResponse.json({ merchant });
}
