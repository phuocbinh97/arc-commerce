import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export interface Transaction {
  txHash: string;
  amount: string;
  orderId: string;
  merchantId: string;
  merchantWallet: string;
  buyerWallet?: string;
  ts: number;
}

// POST /api/transactions — save a transaction
export async function POST(req: NextRequest) {
  try {
    const body: Transaction = await req.json();
    if (!body.txHash || !body.merchantId) {
      return NextResponse.json({ error: "txHash and merchantId required" }, { status: 400 });
    }

    const entry: Transaction = { ...body, ts: body.ts || Date.now() };

    // Push to merchant's transaction list (max 200)
    await redis.lpush(`txns:${body.merchantId}`, JSON.stringify(entry));
    await redis.ltrim(`txns:${body.merchantId}`, 0, 199);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// GET /api/transactions?merchantId=xxx
export async function GET(req: NextRequest) {
  try {
    const merchantId = req.nextUrl.searchParams.get("merchantId");
    if (!merchantId) {
      return NextResponse.json({ error: "merchantId required" }, { status: 400 });
    }

    const raw = await redis.lrange(`txns:${merchantId}`, 0, 99);
    const txns: Transaction[] = raw.map(r => typeof r === "string" ? JSON.parse(r) : r);

    return NextResponse.json({ txns });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
