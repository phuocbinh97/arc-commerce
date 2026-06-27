import { encodeFunctionData, keccak256, toHex } from "viem";

export const ARC_CHAIN_ID_HEX = "0x4cef52";
export const ARC_RPC = "https://rpc.testnet.arc.network";
export const ARC_EXPLORER = "https://testnet.arcscan.app";
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as `0x${string}`;
export const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as `0x${string}`;
export const HUB_CONTRACT = "0xc7cb4f5ace70a4febc3b260591832af72563e988" as `0x${string}`;
export const MERCHANT_WALLET = "0x5e86FCe1b94772Ff6a9632FA8BEc82BA59e24f02" as `0x${string}`;
export const MEMO_CONTRACT    = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505" as `0x${string}`;
export const MULTICALL3FROM   = "0x522fAf9A91c41c443c66765030741e4AaCe147D0" as `0x${string}`;
export const KIT_KEY = process.env.NEXT_PUBLIC_KIT_KEY ?? "";

// ── Transaction Memo helpers (Arc v0.7.2+) ──────────────────────────────────

const MEMO_ABI = [{
  type: "function",
  name: "memo",
  stateMutability: "nonpayable",
  inputs: [
    { name: "target",   type: "address" },
    { name: "data",     type: "bytes"   },
    { name: "memoId",   type: "bytes32" },
    { name: "memoData", type: "bytes"   },
  ],
  outputs: [],
}] as const;

/** bytes32 identifier derived from orderId — used to query memo events later */
export function makeMemoId(orderId: string): `0x${string}` {
  return keccak256(toHex(orderId));
}

/**
 * Wraps any contract calldata in Arc's Memo contract.
 * Sends to MEMO_CONTRACT instead of target directly.
 * Arc's CallFrom precompile preserves msg.sender = original EOA.
 */
export function encodeMemoCallData(
  target: `0x${string}`,
  innerData: `0x${string}`,
  orderId: string,
  memoContent: string,    // max 125 chars
): `0x${string}` {
  const memoId    = makeMemoId(orderId);
  const memoBytes = toHex(new TextEncoder().encode(memoContent.slice(0, 125)));
  return encodeFunctionData({
    abi: MEMO_ABI,
    functionName: "memo",
    args: [target, innerData, memoId, memoBytes],
  });
}

/** Build structured memo JSON — stays under 125 chars */
export function buildMemoContent(params: {
  orderId: string;
  merchantId: string;
  payerName?: string;
}): string {
  const obj: Record<string, unknown> = {
    v:   1,
    ord: params.orderId.slice(0, 32),
    mid: params.merchantId.slice(0, 20),
  };
  if (params.orderId.startsWith("INV-")) obj.inv = params.orderId;
  if (params.payerName?.trim()) obj.n = params.payerName.trim().slice(0, 28);
  return JSON.stringify(obj).slice(0, 125);
}

/** Build payroll memo JSON for a batch session — stays under 125 chars */
export function buildPayrollMemo(params: {
  sessionId: string;
  title: string;
  count: number;
  total: string; // human-readable e.g. "12.50"
}): string {
  return JSON.stringify({
    v:   1,
    t:   "payroll",
    sid: params.sessionId.slice(0, 16),
    lbl: params.title.slice(0, 40),
    n:   params.count,
    amt: params.total,
  }).slice(0, 125);
}

/** Build recurring payment memo JSON — stays under 125 chars */
export function buildRecurringMemo(params: {
  recurringId: string;
  name: string;
  interval: string;
  period: string; // e.g. "2026-06"
}): string {
  return JSON.stringify({
    v:   1,
    t:   "recurring",
    rid: params.recurringId.slice(0, 16),
    lbl: params.name.slice(0, 32),
    int: params.interval,
    per: params.period,
  }).slice(0, 125);
}

// ── Multicall3From — batch transfers preserving msg.sender (Arc v0.7.2+) ───────

const MULTICALL3_ABI = [{
  type: "function", name: "aggregate3", stateMutability: "payable",
  inputs: [{ name: "calls", type: "tuple[]", components: [
    { name: "target",       type: "address" },
    { name: "allowFailure", type: "bool"    },
    { name: "callData",     type: "bytes"   },
  ]}],
  outputs: [{ name: "returnData", type: "tuple[]", components: [
    { name: "success",    type: "bool"  },
    { name: "returnData", type: "bytes" },
  ]}],
}] as const;

/** Encode N direct USDC transfers as a single Multicall3From call */
export function encodeBatchTransfers(
  calls: { recipient: `0x${string}`; units: bigint }[]
): `0x${string}` {
  return encodeFunctionData({
    abi: MULTICALL3_ABI,
    functionName: "aggregate3",
    args: [calls.map(c => ({
      target:       USDC_ADDRESS,
      allowFailure: false as const,
      callData:     (`0xa9059cbb${c.recipient.slice(2).toLowerCase().padStart(64,"0")}${c.units.toString(16).padStart(64,"0")}`) as `0x${string}`,
    }))],
  });
}

/**
 * Decode memoData bytes from a Memo contract tx input.
 * ABI: memo(address target, bytes data, bytes32 memoId, bytes memoData)
 * Returns the UTF-8 string content, or null if not decodable.
 */
export function decodeMemoData(input: string): string | null {
  try {
    const hex = input.startsWith("0x") ? input.slice(2) : input;
    // Layout after 4-byte selector (8 hex chars):
    //  slot0 [8..72]   = address (fixed 32 bytes)
    //  slot1 [72..136] = offset of `data` bytes (dynamic)
    //  slot2 [136..200]= memoId bytes32 (fixed)
    //  slot3 [200..264]= offset of `memoData` bytes (dynamic)
    // offsets are in bytes, relative to start of params (position 8)
    if (hex.length < 264 + 64) return null;
    const offsetMemoData = parseInt(hex.slice(200, 264), 16); // bytes
    const pos = 8 + offsetMemoData * 2;                       // hex position
    const memoLen = parseInt(hex.slice(pos, pos + 64), 16);
    if (!memoLen || memoLen > 125) return null;
    const memoHex = hex.slice(pos + 64, pos + 64 + memoLen * 2);
    const bytes = new Uint8Array(memoLen);
    for (let i = 0; i < memoLen; i++) bytes[i] = parseInt(memoHex.slice(i * 2, i * 2 + 2), 16);
    return new TextDecoder().decode(bytes);
  } catch { return null; }
}

// Strip X-User-Agent header added by Circle SDK — not allowed by Circle CORS policy in browser
if (typeof window !== "undefined") {
  const _orig = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (init?.headers) {
      const h = new Headers(init.headers as HeadersInit);
      h.delete("x-user-agent");
      init = { ...init, headers: h };
    }
    return _orig(input, init);
  };
}

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
const TRANSFER_SIG = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MEMO_SIG     = "0x60a0f5b4fe6d2d1a1e434f1d876eea4e2aae6b1a36c2ad2d14f93c9d8f9e3c5"; // Memo(address,address,bytes32,bytes32,bytes,uint256)

function padAddr(a: string): string {
  return "0x" + a.replace("0x","").toLowerCase().padStart(64,"0");
}

export interface ContactPayment {
  txHash:   string;
  amount:   string; // human-readable USDC
  block:    number;
  ts:       number; // unix ms
  label?:   string; // decoded from Memo event if available
}

/** Query Arc RPC for all USDC transfers from `fromWallet` to `toWallet` */
export async function fetchContactPayments(
  fromWallet: string,
  toWallet:   string,
): Promise<ContactPayment[]> {
  const rpc = ARC_RPC;

  // 1. USDC Transfer logs: from=fromWallet, to=toWallet
  const transferLogs: any[] = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc:"2.0", id:1, method:"eth_getLogs", params:[{
      address:   USDC_ADDRESS,
      fromBlock: "0x0",
      toBlock:   "latest",
      topics:    [TRANSFER_SIG, padAddr(fromWallet), padAddr(toWallet)],
    }]}),
  }).then(r=>r.json()).then(r=>r.result||[]).catch(()=>[]);

  if (transferLogs.length === 0) return [];

  // 2. Fetch block timestamps for unique blocks
  const blockNums = [...new Set(transferLogs.map((l:any)=>l.blockNumber))];
  const blockMap: Record<string, number> = {};
  await Promise.all(blockNums.map(async bn => {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc:"2.0", id:2, method:"eth_getBlockByNumber", params:[bn, false] }),
    }).then(r=>r.json()).catch(()=>null);
    if (res?.result?.timestamp) blockMap[bn as string] = parseInt(res.result.timestamp, 16) * 1000;
  }));

  // 3. Memo events from MEMO_CONTRACT sent by fromWallet (to correlate txHash → label)
  const memoLogs: any[] = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc:"2.0", id:3, method:"eth_getLogs", params:[{
      address:   MEMO_CONTRACT,
      fromBlock: "0x0",
      toBlock:   "latest",
      topics:    [MEMO_SIG, padAddr(fromWallet)],
    }]}),
  }).then(r=>r.json()).then(r=>r.result||[]).catch(()=>[]);

  const memoByTx: Record<string, string> = {};
  for (const log of memoLogs) {
    const decoded = decodeMemoData(log.data || "");
    if (decoded) {
      try {
        const obj = JSON.parse(decoded);
        memoByTx[log.transactionHash] = obj.lbl || obj.ord || decoded;
      } catch { memoByTx[log.transactionHash] = decoded; }
    }
  }

  // 4. Build result
  return transferLogs.map((log: any) => {
    const units = BigInt(log.data);
    const amount = (Number(units) / 1_000_000).toFixed(2);
    return {
      txHash: log.transactionHash,
      amount,
      block:  parseInt(log.blockNumber, 16),
      ts:     blockMap[log.blockNumber] ?? 0,
      label:  memoByTx[log.transactionHash],
    };
  }).sort((a, b) => b.ts - a.ts);
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
