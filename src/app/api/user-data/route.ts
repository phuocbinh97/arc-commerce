import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";

const CORS = {
  "Access-Control-Allow-Origin": "https://arcpay-desk.vercel.app",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

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
  return NextResponse.json(data || {}, { headers: CORS });
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
  return NextResponse.json({ ok: true }, { headers: CORS });
}
