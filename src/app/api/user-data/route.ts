import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = [
  "https://arcpay-desk.vercel.app",
  "https://nexmer.xyz",
  "https://www.nexmer.xyz",
];

function corsHeaders(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[1];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

const DATA_KEYS = [
  "arcCheckoutHistory",
  "arcCommerceInvoices",
  "arcCommerceSettings",
  "arcBridgeHistory",
  "arcRecurringPayments",
  "arcRecurringInvoices",
  "arcMerchantSession",
  "arcPeopleContacts",
  "arcPayrollSessions",
  "arcContactPayments",
];

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")?.toLowerCase();
  if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });

  const data = await kv.get<Record<string, unknown>>(`user:${wallet}`);
  return NextResponse.json(data || {}, { headers: corsHeaders(req) });
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
  return NextResponse.json({ ok: true }, { headers: corsHeaders(req) });
}
