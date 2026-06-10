import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export interface InvoiceRecord {
  id: string;
  amount: string;
  description: string;
  memo: string;
  status: "pending" | "paid" | "expired";
  merchantId: string;
  createdAt: number;
  expiresAt: number | null;
  paidAt?: number;
  txHash?: string;
}

// GET /api/invoices?merchantId=xxx
export async function GET(req: NextRequest) {
  const merchantId = req.nextUrl.searchParams.get("merchantId");
  if (!merchantId) return NextResponse.json({ error: "merchantId required" }, { status: 400 });
  const raw = await redis.lrange(`invoices:${merchantId}`, 0, 199);
  const invoices: InvoiceRecord[] = raw.map(r => typeof r === "string" ? JSON.parse(r) : r);
  return NextResponse.json({ invoices });
}

// POST /api/invoices — create invoice
export async function POST(req: NextRequest) {
  const body: InvoiceRecord = await req.json();
  if (!body.id || !body.merchantId) return NextResponse.json({ error: "id and merchantId required" }, { status: 400 });
  await redis.lpush(`invoices:${body.merchantId}`, JSON.stringify(body));
  await redis.ltrim(`invoices:${body.merchantId}`, 0, 199);
  // Index by invoiceId for quick lookup
  await redis.set(`invoice:${body.id}`, JSON.stringify(body));
  return NextResponse.json({ ok: true });
}

// PATCH /api/invoices — mark paid
export async function PATCH(req: NextRequest) {
  const { invoiceId, txHash } = await req.json();
  if (!invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
  const raw: string | null = await redis.get(`invoice:${invoiceId}`);
  if (!raw) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const inv: InvoiceRecord = typeof raw === "string" ? JSON.parse(raw) : raw;
  inv.status = "paid";
  inv.paidAt = Date.now();
  if (txHash) inv.txHash = txHash;
  await redis.set(`invoice:${invoiceId}`, JSON.stringify(inv));
  // Update in list
  const listRaw = await redis.lrange(`invoices:${inv.merchantId}`, 0, 199);
  const list = listRaw.map((r: any) => {
    const item = typeof r === "string" ? JSON.parse(r) : r;
    return item.id === invoiceId ? inv : item;
  });
  await redis.del(`invoices:${inv.merchantId}`);
  if (list.length > 0) {
    await redis.rpush(`invoices:${inv.merchantId}`, ...list.map((i: any) => JSON.stringify(i)));
  }
  return NextResponse.json({ ok: true, invoice: inv });
}
