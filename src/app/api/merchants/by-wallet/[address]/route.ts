import { NextRequest, NextResponse } from "next/server";
import { redis, Merchant } from "@/lib/redis";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  const merchantId: string | null = await redis.get(`wallet:${address.toLowerCase()}`);
  if (!merchantId) {
    return NextResponse.json({ merchant: null });
  }
  const merchant: Merchant | null = await redis.get(`merchant:${merchantId}`);
  return NextResponse.json({ merchant: merchant || null });
}
