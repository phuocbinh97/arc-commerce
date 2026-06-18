import { NextRequest, NextResponse } from "next/server";
import { redis, Merchant } from "@/lib/redis";

function genId() {
  return "mer_" + Math.random().toString(36).slice(2, 9);
}

export async function POST(req: NextRequest) {
  try {
    const { name, wallet, siteUrl } = await req.json();

    if (!name || !wallet) {
      return NextResponse.json({ error: "name and wallet required" }, { status: 400 });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    // Check if wallet already registered — update name/siteUrl if changed
    const existing: string | null = await redis.get(`wallet:${wallet.toLowerCase()}`);
    if (existing) {
      const merchant: Merchant | null = await redis.get(`merchant:${existing}`);
      if (merchant) {
        let changed = false;
        if (merchant.name !== name) { merchant.name = name; changed = true; }
        if (siteUrl !== undefined && merchant.siteUrl !== siteUrl) { merchant.siteUrl = siteUrl || undefined; changed = true; }
        if (changed) await redis.set(`merchant:${existing}`, merchant);
        return NextResponse.json({ merchant });
      }
    }

    const merchantId = genId();
    const merchant: Merchant = {
      merchantId,
      name,
      wallet: wallet.toLowerCase(),
      createdAt: Date.now(),
      ...(siteUrl ? { siteUrl } : {}),
    };

    // Save merchant data + wallet index
    await redis.set(`merchant:${merchantId}`, merchant);
    await redis.set(`wallet:${wallet.toLowerCase()}`, merchantId);

    return NextResponse.json({ merchant });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
