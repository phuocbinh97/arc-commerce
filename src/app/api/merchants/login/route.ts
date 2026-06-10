import { NextRequest, NextResponse } from "next/server";
import { redis, Merchant } from "@/lib/redis";
import { createPublicClient, http, verifyMessage } from "viem";

export async function POST(req: NextRequest) {
  try {
    const { wallet, signature } = await req.json();
    if (!wallet || !signature) {
      return NextResponse.json({ error: "wallet and signature required" }, { status: 400 });
    }

    const message = `ArcCommerce:login:${wallet.toLowerCase()}`;

    // Verify EIP-191 signature using viem (already in deps via @circle-fin)
    const valid = await verifyMessage({ address: wallet as `0x${string}`, message, signature });
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const merchantId: string | null = await redis.get(`wallet:${wallet.toLowerCase()}`);
    if (!merchantId) {
      return NextResponse.json({ error: "Wallet not registered. Go to Settings → Register as Merchant first." }, { status: 404 });
    }
    const merchant: Merchant | null = await redis.get(`merchant:${merchantId}`);
    if (!merchant) {
      return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
    }

    return NextResponse.json({ merchant });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
