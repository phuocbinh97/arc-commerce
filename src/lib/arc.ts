export const ARC_CHAIN_ID_HEX = "0x4cef52";
export const ARC_RPC = "https://rpc.testnet.arc.network";
export const ARC_EXPLORER = "https://testnet.arcscan.app";
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as `0x${string}`;
export const HUB_CONTRACT = "0xc7cb4f5ace70a4febc3b260591832af72563e988" as `0x${string}`;
export const MERCHANT_WALLET = "0x5e86FCe1b94772Ff6a9632FA8BEc82BA59e24f02" as `0x${string}`;
export const KIT_KEY = process.env.NEXT_PUBLIC_KIT_KEY ?? "";

export function parseUsdcErc20(amount: string): bigint {
  const [whole, fraction = ""] = amount.trim().split(".");
  return BigInt(whole) * 10n ** 6n + BigInt(fraction.padEnd(6, "0").slice(0, 6));
}
export function formatUsdc(n: string | number): string {
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function shortAddr(a: string): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
}
export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function encodeAddress(a: string) { return a.toLowerCase().replace("0x","").padStart(64,"0"); }
function encodeUint(v: bigint) { return v.toString(16).padStart(64,"0"); }
function utf8ToHex(v: string) { return Array.from(new TextEncoder().encode(v)).map(b=>b.toString(16).padStart(2,"0")).join(""); }
function encodeDynStr(v: string) {
  const hex = utf8ToHex(v);
  return encodeUint(BigInt(hex.length/2)) + hex.padEnd(Math.ceil(hex.length/64)*64,"0");
}
export function encodeApprove(spender: string, units: bigint): `0x${string}` {
  return `0x095ea7b3${encodeAddress(spender)}${encodeUint(units)}`;
}
export function encodeHubPay(merchant: string, merchantId: string, orderId: string, units: bigint, memo: string): `0x${string}` {
  const h=32n*5n, mid=encodeDynStr(merchantId), od=encodeDynStr(orderId), md=encodeDynStr(memo);
  const mio=h, oo=mio+BigInt(mid.length/2), mo=oo+BigInt(od.length/2);
  return `0xfdc9fcdf${encodeAddress(merchant)}${encodeUint(mio)}${encodeUint(oo)}${encodeUint(units)}${encodeUint(mo)}${mid}${od}${md}`;
}
export async function fetchGasPrice(provider: any) {
  try {
    const block = await provider.request({ method:"eth_getBlockByNumber", params:["latest",false] });
    const base = BigInt(block.baseFeePerGas||"0x0");
    const max = base + (base*20n)/100n + 1n;
    return { maxFeePerGas:"0x"+max.toString(16), maxPriorityFeePerGas:"0x0" };
  } catch { return { maxFeePerGas:"0x4a817c800", maxPriorityFeePerGas:"0x0" }; }
}
export async function waitForReceipt(provider: any, txHash: string, ms=30000) {
  const start = Date.now();
  while (Date.now()-start < ms) {
    const r = await provider.request({ method:"eth_getTransactionReceipt", params:[txHash] });
    if (r) { if (r.status==="0x0") throw new Error("Transaction reverted."); return r; }
    await new Promise(res=>setTimeout(res,500));
  }
  throw new Error("Not confirmed after 30s.");
}
