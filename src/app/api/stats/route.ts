import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export async function GET() {
  try {
    // Scan all merchant transaction lists in Redis
    const keys: string[] = await redis.keys("txns:*");
    if (keys.length === 0) {
      return NextResponse.json({ totalTxns: 0, txnsToday: 0 });
    }

    // Fetch all transaction lists in parallel
    const lists = await Promise.all(keys.map(k => redis.lrange(k, 0, -1)));

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    let totalTxns = 0;
    let txnsToday = 0;

    for (const list of lists) {
      totalTxns += list.length;
      for (const item of list) {
        const t = typeof item === "string" ? JSON.parse(item) : item;
        if (t.ts >= todayMs) txnsToday++;
      }
    }

    return NextResponse.json({ totalTxns, txnsToday });
  } catch {
    return NextResponse.json({ totalTxns: 0, txnsToday: 0 });
  }
}
