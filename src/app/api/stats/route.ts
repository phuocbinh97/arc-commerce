import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export async function GET() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [total, todayCount] = await Promise.all([
      redis.get<number>("stats:txns:total"),
      redis.get<number>(`stats:txns:${today}`),
    ]);
    return NextResponse.json({
      totalTxns: total ?? 0,
      txnsToday: todayCount ?? 0,
    });
  } catch {
    return NextResponse.json({ totalTxns: 0, txnsToday: 0 });
  }
}
