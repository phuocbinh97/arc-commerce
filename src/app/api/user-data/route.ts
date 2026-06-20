import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";

const DATA_KEYS = [
  "arcCheckoutHistory",
  "arcCommerceInvoices",
  "arcCommerceSettings",
  "arcBridgeHistory",
  "arcRecurringPayments",
  "arcRecurringInvoices",
  "arcMerchantSession",
];

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")?.toLowerCase();
  if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });

  const data = await kv.get<Record<string, unknown>>(`user:${wallet}`);
  return NextResponse.json(data || {});
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const wallet = body.wallet?.toLowerCase();
  if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });

  const key = `user:${wallet}`;
  const existing = (await kv.get<Record<string, unknown>>(key)) || {};

  // Merge: only update keys provided in the request
  const updated: Record<string, unknown> = { ...existing };
  for (const k of DATA_KEYS) {
    if (body[k] !== undefined) updated[k] = body[k];
  }

  await kv.set(key, updated);
  return NextResponse.json({ ok: true });
}
