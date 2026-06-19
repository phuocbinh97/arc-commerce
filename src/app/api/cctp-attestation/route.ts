import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get("domain");
  const txHash = req.nextUrl.searchParams.get("txHash");
  if (!domain || !txHash) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  const url = `https://iris-api-sandbox.circle.com/v1/messages/${domain}?transactionHash=${txHash}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const data = await res.json();
  return NextResponse.json(data);
}
