"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useCheckout } from "@/hooks/useCheckout";
import { formatUsdc, shortAddr, ARC_EXPLORER, EURC_ADDRESS } from "@/lib/arc";
import { getSettings } from "@/lib/storage";

type PayToken = "USDC" | "EURC" | "cirBTC" | "ETH" | "BNB" | "SOL" | "BTC" | "MATIC";

interface TokenDef {
  label: string;
  symbol: string;
  color: string;
  bg: string;
  chain: string;
  chainColor: string;
  status: "live" | "arc-soon" | "crosschain-soon";
  icon: string;
}

const TOKENS: Record<PayToken, TokenDef> = {
  USDC:   { label: "USDC",    symbol: "$",  color: "#fff",    bg: "#2775ca", chain: "Arc Testnet",    chainColor: "#0757f9", status: "live",             icon: "💵" },
  EURC:   { label: "EURC",    symbol: "€",  color: "#fff",    bg: "#3b82f6", chain: "Arc Testnet",    chainColor: "#0757f9", status: "live",             icon: "💶" },
  cirBTC: { label: "cirBTC",  symbol: "₿",  color: "#fff",    bg: "#f7931a", chain: "Arc Testnet",    chainColor: "#0757f9", status: "arc-soon",         icon: "🟠" },
  ETH:    { label: "ETH",     symbol: "Ξ",  color: "#fff",    bg: "#627eea", chain: "Ethereum",       chainColor: "#627eea", status: "crosschain-soon",  icon: "⟠"  },
  BNB:    { label: "BNB",     symbol: "B",  color: "#1a1a2e", bg: "#f0b90b", chain: "BNB Chain",      chainColor: "#f0b90b", status: "crosschain-soon",  icon: "🟡" },
  SOL:    { label: "SOL",     symbol: "◎",  color: "#fff",    bg: "#9945ff", chain: "Solana",         chainColor: "#9945ff", status: "crosschain-soon",  icon: "◎"  },
  BTC:    { label: "BTC",     symbol: "₿",  color: "#fff",    bg: "#f7931a", chain: "Bitcoin",        chainColor: "#f7931a", status: "crosschain-soon",  icon: "₿"  },
  MATIC:  { label: "POL",     symbol: "M",  color: "#fff",    bg: "#8247e5", chain: "Polygon",        chainColor: "#8247e5", status: "crosschain-soon",  icon: "🟣" },
};

const TOKEN_ORDER: PayToken[] = ["USDC", "EURC", "cirBTC", "ETH", "SOL", "BNB", "BTC", "MATIC"];

const STEP_LABELS: Record<string, string> = {
  idle:                 "Pay now",
  swapping:             "Swapping to USDC…",
  approving:            "Step 1/2 — Approve USDC…",
  "confirming-approve": "Confirming approve…",
  paying:               "Step 2/2 — Sending payment…",
  "confirming-pay":     "Waiting for receipt…",
  success:              "Payment Confirmed!",
  error:                "Try again",
};

function StatusDot({ status }: { status: TokenDef["status"] }) {
  if (status === "live")       return <span className="w-1.5 h-1.5 rounded-full bg-green shrink-0" />;
  if (status === "arc-soon")   return <span className="w-1.5 h-1.5 rounded-full bg-amber shrink-0" />;
  return <span className="w-1.5 h-1.5 rounded-full bg-muted shrink-0" />;
}

function StatusLabel({ status }: { status: TokenDef["status"] }) {
  if (status === "live")     return <span className="text-[10px] text-green font-semibold">Live</span>;
  if (status === "arc-soon") return <span className="text-[10px] text-amber font-semibold">Arc soon</span>;
  return <span className="text-[10px] text-muted">Coming soon</span>;
}

function TokenDropdown({ value, onChange, balances }: { value: PayToken; onChange: (t: PayToken) => void; balances: Partial<Record<PayToken, string>> }) {
  const [open, setOpen] = useState(false);
  const meta = TOKENS[value];
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 bg-surface2 border border-white/14 rounded-lg hover:border-white/30 transition-colors">
        <div className="w-7 h-7 rounded-full grid place-items-center text-[13px] font-bold shrink-0"
          style={{ background: meta.bg, color: meta.color }}>{meta.symbol}</div>
        <div className="flex-1 text-left">
          <div className="text-[13.5px] font-semibold text-ink">{meta.label}</div>
          <div className="text-[10.5px] text-muted">{meta.chain}</div>
        </div>
        <StatusDot status={meta.status} />
        <svg className={`w-4 h-4 text-ink shrink-0 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd"/></svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-surface border border-white/14 rounded-xl shadow-2xl overflow-hidden">
            {TOKEN_ORDER.map(tok => {
              const m = TOKENS[tok];
              const disabled = m.status !== "live";
              return (
                <button key={tok} disabled={disabled}
                  onClick={() => { if (!disabled) { onChange(tok); setOpen(false); } }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 border-b border-white/8 last:border-0 transition-colors text-left
                    ${tok === value ? "bg-accent/10" : "hover:bg-surface2"}
                    ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}>
                  <div className="w-7 h-7 rounded-full grid place-items-center text-[13px] font-bold shrink-0"
                    style={{ background: m.bg, color: m.color }}>{m.symbol}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-ink">{m.label}</div>
                    <div className="text-[10.5px] text-muted">{m.chain}</div>
                  </div>
                  <div className="text-right">
                    <div><StatusLabel status={m.status} /></div>
                    <div className="font-mono text-[11px] text-muted mt-0.5">
                      {balances[tok] ?? "—"}
                    </div>
                  </div>
                  {tok === value && <span className="text-accent text-xs ml-1">✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function CheckoutContent() {
  const params = useSearchParams();
  const amount    = params.get("amount")       || "1.00";
  const orderId   = params.get("order")        || `order-${Date.now()}`;
  const memo      = params.get("memo")         || "";
  const merchantName    = params.get("merchantName")    || "Nexmer";
  const merchantParam   = params.get("merchant")        || "";
  const merchantWalletParam = params.get("merchantWallet") || "";
  const redirect  = params.get("redirect")     || "";

  const { account, isConnected, isArcNetwork, connect, switchToArc } = useWallet();
  const { step, txHash, error, pay, reset } = useCheckout();

  const [usdcBalance, setUsdcBalance] = useState("—");
  const [eurcBalance, setEurcBalance] = useState("—");
  const [payToken, setPayToken]       = useState<PayToken>("USDC");
  const [payerName, setPayerName]     = useState("");
  const [feeEst, setFeeEst]           = useState<{ gas: string; total: string } | null>(null);
  const [merchantOverride, setMerchantOverride] = useState<{ wallet: string; merchantId: string } | undefined>();
  const [merchantSiteUrl, setMerchantSiteUrl]   = useState("");
  const [loadingMerchant, setLoadingMerchant]   = useState(false);

  const settings = typeof window !== "undefined"
    ? getSettings()
    : { businessName: "", merchantId: "", merchantWallet: "", hubContract: "" };

  useEffect(() => {
    if (!merchantWalletParam) return;
    setMerchantOverride({ wallet: merchantWalletParam, merchantId: "demo" });
  }, [merchantWalletParam]);

  useEffect(() => {
    if (!merchantParam) return;
    setLoadingMerchant(true);
    fetch(`/api/merchants/${merchantParam}`)
      .then(r => r.json())
      .then(data => {
        if (data.merchant) {
          setMerchantOverride({ wallet: data.merchant.wallet, merchantId: data.merchant.merchantId });
          if (data.merchant.siteUrl) setMerchantSiteUrl(data.merchant.siteUrl);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingMerchant(false));
  }, [merchantParam]);

  useEffect(() => {
    if (!account) return;
    const eth = (window as any).ethereum;
    if (!eth) return;
    const fetchBal = async (tokenAddr: string) => {
      const data = "0x70a08231" + account.toLowerCase().replace("0x", "").padStart(64, "0");
      const raw = await eth.request({ method: "eth_call", params: [{ to: tokenAddr, data }, "latest"] });
      return (Number(BigInt(raw)) / 1_000_000).toFixed(2);
    };
    fetchBal("0x3600000000000000000000000000000000000000").then(setUsdcBalance).catch(() => setUsdcBalance("0.00"));
    fetchBal(EURC_ADDRESS).then(setEurcBalance).catch(() => setEurcBalance("0.00"));
  }, [account]);

  // Pre-flight: estimate gas fee in USDC (Arc uses USDC as gas token)
  useEffect(() => {
    if (!isConnected || !isArcNetwork) { setFeeEst(null); return; }
    const eth = (window as any).ethereum;
    if (!eth) return;
    eth.request({ method: "eth_gasPrice" }).then((hex: string) => {
      const gasPrice  = BigInt(hex);
      const totalGas  = 600_000n; // approve (~100k) + memo-wrapped payToMerchant (~500k)
      const feeUnits  = gasPrice * totalGas;             // in USDC micro-units (6 dec)
      const feeUsdc   = Number(feeUnits) / 1e6;
      const totalUsdc = parseFloat(amount) + feeUsdc;
      setFeeEst({
        gas:   feeUsdc  < 0.0001 ? "<0.0001" : feeUsdc.toFixed(4),
        total: totalUsdc.toFixed(4),
      });
    }).catch(() => setFeeEst(null));
  }, [isConnected, isArcNetwork, amount]);

  // Redirect + postMessage on success
  useEffect(() => {
    if (step !== "success") return;
    if (window.parent !== window) {
      window.parent.postMessage({ type: "ARCPAY_SUCCESS", orderId, txHash }, "*");
    }
    if (!redirect) return;
    const sep = redirect.includes("?") ? "&" : "?";
    const timer = setTimeout(() => {
      window.location.href = `${redirect}${sep}order=${orderId}&tx=${txHash}`;
    }, 3000);
    return () => clearTimeout(timer);
  }, [step, redirect, orderId, txHash]);

  const isEmbed = params.get("embed") === "1";
  const displayName = merchantOverride
    ? (params.get("merchantName") || merchantParam)
    : (merchantName || settings.businessName || "Nexmer");

  const usdcSufficient = usdcBalance !== "—" && parseFloat(usdcBalance) >= parseFloat(amount);
  const eurcSufficient = eurcBalance !== "—" && parseFloat(eurcBalance) >= parseFloat(amount) * 1.01;
  const hasGas         = usdcBalance !== "—" && parseFloat(usdcBalance) >= 0.01;

  function getBalance(tok: PayToken): string {
    if (tok === "USDC") return usdcBalance;
    if (tok === "EURC") return eurcBalance;
    return "—";
  }

  function isSufficient(tok: PayToken): boolean {
    if (tok === "USDC") return usdcSufficient;
    if (tok === "EURC") return eurcSufficient;
    return false;
  }

  function isDisabled(tok: PayToken): boolean {
    const meta = TOKENS[tok];
    if (meta.status !== "live") return true;
    return false;
  }

  const activeSufficient = isSufficient(payToken);
  const activeBalance    = getBalance(payToken);
  const activeMeta       = TOKENS[payToken];

  async function handlePay() {
    if (!isConnected) { await connect(); return; }
    if (!isArcNetwork) { await switchToArc(); return; }
    await pay({ amount, orderId, memo, payerName: payerName.trim() || undefined, merchantOverride, payToken: payToken as "USDC" | "EURC" }).catch(() => {});
  }

  const payLabel = (step === "idle" || step === "error")
    ? payToken === "USDC" ? "Pay with USDC" : `Swap ${activeMeta.label} → USDC & Pay`
    : STEP_LABELS[step];

  const canPay = ["idle", "error"].includes(step)
    && !loadingMerchant
    && !(isConnected && !activeSufficient)
    && !(isConnected && payToken === "EURC" && !hasGas);

  if (step === "success") {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-6">
        <div className="bg-surface border border-white/8 rounded-xl p-8 w-full max-w-md text-center shadow-2xl">
          <div className="text-5xl mb-3">✅</div>
          <h1 className="text-2xl font-bold text-green mb-1">Payment Confirmed!</h1>
          <p className="text-muted text-sm mb-6">Confirmed on Arc Testnet · {new Date().toLocaleTimeString()}</p>
          <div className="bg-surface2 border border-white/8 rounded-xl p-4 text-left mb-6">
            <div className="flex justify-between text-sm mb-2"><span className="text-muted">Amount</span><strong className="text-ink">{amount} USDC</strong></div>
            <div className="flex justify-between text-sm mb-2"><span className="text-muted">Order ID</span><strong className="text-ink">{orderId}</strong></div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-muted">Transaction</span>
              <div className="flex items-center gap-2">
                <strong className="font-mono text-xs text-ink">{txHash.slice(0, 10)}…</strong>
                <button onClick={() => navigator.clipboard?.writeText(txHash)} className="text-xs text-muted hover:text-ink">Copy</button>
              </div>
            </div>
            <a href={`${ARC_EXPLORER}/tx/${txHash}`} target="_blank" rel="noreferrer"
              className="block text-center mt-3 text-accent font-semibold text-sm hover:underline">View on ArcScan →</a>
          </div>
          {redirect ? <p className="text-muted text-xs mb-3">Redirecting back to shop in 3s…</p> : null}
          <button onClick={reset} className="w-full py-3 border border-white/8 rounded-lg font-semibold text-sm text-ink hover:bg-surface2">← New Payment</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-bg flex items-center justify-center ${isEmbed ? "p-3" : "p-6"}`}>
      <div className={isEmbed ? "w-full max-w-md" : "grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 w-full max-w-4xl items-start"}>

        {/* Left: form */}
        <div className="bg-surface border border-white/8 rounded-xl shadow-lg">
          <div className="p-6">

            {/* Wallet status */}
            <div className="flex items-center justify-between mb-4 p-3 bg-surface2 border border-white/8 rounded-lg text-sm">
              <span className="text-muted">{isConnected ? `Connected: ${shortAddr(account)}` : "Wallet not connected"}</span>
              {isArcNetwork && <span className="flex items-center gap-1.5 text-accent font-semibold"><span className="w-2 h-2 rounded-full bg-accent" />Arc Testnet</span>}
            </div>

            {/* Merchant */}
            <div className="mb-5 p-3.5 bg-surface2 border border-white/8 rounded-lg flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent grid place-items-center text-white font-bold text-lg shrink-0">{displayName.charAt(0).toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-muted uppercase">Merchant</div>
                <div className="font-semibold text-ink">{loadingMerchant ? "Loading…" : displayName}</div>
                {merchantSiteUrl && (
                  <a href={merchantSiteUrl} target="_blank" rel="noreferrer"
                    className="text-[11px] text-accent hover:underline truncate block">
                    {merchantSiteUrl.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>
              <div className="ml-auto text-xs text-green font-semibold bg-green/10 px-2 py-0.5 rounded-full shrink-0">✓ Verified</div>
            </div>

            {/* Token selector */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12.5px] font-semibold text-muted">Pay with</span>
                <span className="text-[11px] text-muted">Merchant always receives USDC</span>
              </div>
              <TokenDropdown value={payToken} onChange={setPayToken} balances={{ USDC: usdcBalance, EURC: eurcBalance }} />
              {payToken === "EURC" && (
                <div className="mt-2 px-3 py-2 bg-surface2 border border-white/8 rounded-lg text-[11.5px] text-muted">
                  ~{(parseFloat(amount) * 1.01).toFixed(2)} EURC will be swapped → {amount} USDC via Arc App Kit.
                </div>
              )}
              {TOKENS[payToken].status === "crosschain-soon" && (
                <div className="mt-2 px-3 py-2 bg-purple/10 border border-purple/20 rounded-lg text-[11.5px] text-[#a371f7]">
                  🔗 Cross-chain via LI.FI — coming on Arc Mainnet. {activeMeta.label} → USDC auto-swap.
                </div>
              )}
              {payToken === "cirBTC" && (
                <div className="mt-2 px-3 py-2 bg-amber/10 border border-amber/20 rounded-lg text-[11.5px] text-amber">
                  ⏳ cirBTC swap coming soon on Arc App Kit.
                </div>
              )}
            </div>

            {/* Balance row */}
            {isConnected && TOKENS[payToken].status === "live" && (
              <div className={`mb-4 flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium
                ${activeSufficient ? "bg-green/10 border border-green/20 text-green" : "bg-red/10 border border-red/20 text-red"}`}>
                <span>Your {activeMeta.label} balance: {activeBalance}</span>
                <div className="flex items-center gap-2">
                  <span>{activeSufficient ? "✓ Sufficient" : "✗ Insufficient"}</span>
                  {!activeSufficient && (
                    <a href="https://faucet.circle.com" target="_blank" rel="noreferrer"
                      className="text-[11.5px] font-semibold underline opacity-80 hover:opacity-100">
                      Get {activeMeta.label} →
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* No gas warning */}
            {isConnected && payToken === "EURC" && !hasGas && (
              <div className="mb-4 px-3 py-2.5 bg-amber/10 border border-amber/30 rounded-lg text-amber text-[12.5px]">
                ⛽ Arc uses USDC as gas. You need at least <strong>~0.01 USDC</strong> for network fees.{" "}
                <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="underline font-semibold">Get free USDC →</a>
              </div>
            )}

            {/* Order fields */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-semibold text-muted uppercase mb-1 block">Amount</label>
                <input value={formatUsdc(amount)} readOnly className="w-full border border-white/8 rounded-lg px-3 py-2.5 text-sm bg-surface2 text-ink" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted uppercase mb-1 block">Merchant receives</label>
                <input value="USDC" disabled className="w-full border border-white/8 rounded-lg px-3 py-2.5 text-sm bg-surface2 text-ink" />
              </div>
            </div>
            <div className="mb-3">
              <label className="text-xs font-semibold text-muted uppercase mb-1 block">Order ID</label>
              <input value={orderId} readOnly className="w-full border border-white/8 rounded-lg px-3 py-2.5 text-sm bg-surface2 text-ink font-mono" />
            </div>
            <div className="mb-3">
              <label className="text-xs font-semibold text-muted uppercase mb-1 block">Your name <span className="normal-case font-normal text-muted">(optional)</span></label>
              <input value={payerName} onChange={e => setPayerName(e.target.value)}
                placeholder="e.g. John Doe"
                className="w-full border border-white/8 rounded-lg px-3 py-2.5 text-sm bg-surface2 text-ink outline-none focus:border-accent transition-colors" />
            </div>
            {memo && (
              <div className="mb-4">
                <label className="text-xs font-semibold text-muted uppercase mb-1 block">Memo</label>
                <textarea value={memo} readOnly rows={2} className="w-full border border-white/8 rounded-lg px-3 py-2.5 text-sm bg-surface2 text-ink resize-none" />
              </div>
            )}

            {/* Pre-flight fee estimate */}
            {feeEst && isConnected && isArcNetwork && (
              <div className="mb-3 px-3 py-2.5 bg-surface2 border border-white/8 rounded-lg text-[12px]">
                <div className="flex items-center justify-between text-muted mb-1">
                  <span>Network fee (gas)</span>
                  <span className="font-mono text-ink">~{feeEst.gas} USDC</span>
                </div>
                <div className="flex items-center justify-between font-semibold">
                  <span className="text-muted">Total (amount + fee)</span>
                  <span className="font-mono text-ink">~{feeEst.total} USDC</span>
                </div>
              </div>
            )}

            {error && <div className="mb-3 px-3 py-2 bg-red/10 border border-red/20 rounded-lg text-red text-sm">{error}</div>}

            <div className="flex gap-2">
              <button onClick={handlePay} disabled={!canPay}
                className="flex-1 py-2.5 bg-accent text-white rounded-lg font-semibold text-sm disabled:opacity-60 hover:bg-accent/90 transition-colors">
                {payLabel}
              </button>
              <button onClick={switchToArc} className="px-4 py-2.5 border border-white/8 rounded-lg font-semibold text-sm text-muted hover:bg-surface2">
                Switch network
              </button>
            </div>

            <p className="text-center text-[11px] text-muted mt-3">
              Powered by{" "}
              <span className="text-accent font-semibold">Nexmer</span>
              {" · "}Circle CCTP · Arc App Kit
            </p>
          </div>
        </div>

        {/* Right: preview */}
        {!isEmbed && (
          <div className="bg-surface border border-white/8 rounded-xl shadow-lg p-6">
            <h2 className="font-semibold text-ink mb-1">Payment preview</h2>
            <div className="text-4xl font-black tracking-tight mb-1 text-ink">
              ${formatUsdc(amount)} <span className="text-lg text-muted font-semibold">USDC</span>
            </div>
            <p className="text-muted text-[12.5px] mb-5">
              {payToken === "EURC"
                ? `~${(parseFloat(amount) * 1.01).toFixed(2)} EURC → ${amount} USDC via Arc App Kit swap, then paid to merchant.`
                : TOKENS[payToken].status === "crosschain-soon"
                ? `${activeMeta.label} on ${activeMeta.chain} → USDC on Arc via cross-chain swap (coming soon).`
                : "USDC sent directly through the merchant contract on Arc."}
            </p>

            <h3 className="font-semibold text-ink mb-3 text-sm">How it works</h3>
            {(payToken === "EURC"
              ? [
                  ["Swap EURC → USDC", "Arc App Kit swaps your EURC to USDC.", "live"],
                  ["Approve USDC",     "Allow checkout to spend the invoice amount.", "live"],
                  ["Confirm payment",  "USDC sent to merchant contract on Arc.", "live"],
                  ["Get receipt",      "View confirmed tx on ArcScan.", "live"],
                ]
              : TOKENS[payToken].status === "crosschain-soon"
              ? [
                  ["Connect source chain", `${activeMeta.label} detected on ${activeMeta.chain}.`, "soon"],
                  ["Cross-chain swap",     `${activeMeta.label} → USDC via LI.FI aggregator.`, "soon"],
                  ["Bridge to Arc",        "USDC bridged to Arc Testnet via CCTP.", "soon"],
                  ["Confirm payment",      "USDC sent to merchant on Arc.", "soon"],
                  ["Get receipt",          "View confirmed tx on ArcScan.", "soon"],
                ]
              : payToken === "cirBTC"
              ? [
                  ["Swap cirBTC → USDC", "Arc App Kit swap (coming soon).", "soon"],
                  ["Approve USDC",       "Allow checkout to spend the invoice amount.", "live"],
                  ["Confirm payment",    "USDC sent to merchant contract on Arc.", "live"],
                  ["Get receipt",        "View confirmed tx on ArcScan.", "live"],
                ]
              : [
                  ["Approve USDC",    "Allow this checkout to use exactly the invoice amount.", "live"],
                  ["Confirm payment", "Send USDC through the merchant contract on Arc.", "live"],
                  ["Get receipt",     "View the confirmed transaction on ArcScan.", "live"],
                ]
            ).map(([t, d, s], i) => (
              <div key={i} className={`flex gap-3 mb-3 ${s === "soon" ? "opacity-50" : "opacity-90"}`}>
                <div className={`w-7 h-7 rounded-full grid place-items-center text-xs font-bold shrink-0
                  ${s === "soon" ? "bg-surface2 border border-white/14 text-muted" : "bg-accent/15 text-accent"}`}>
                  {i + 1}
                </div>
                <div>
                  <div className="font-semibold text-sm text-ink flex items-center gap-2">
                    {t}
                    {s === "soon" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-surface border border-white/14 text-muted">SOON</span>}
                  </div>
                  <div className="text-xs text-muted">{d}</div>
                </div>
              </div>
            ))}

            {/* Roadmap section */}
            <div className="mt-4 pt-4 border-t border-white/8">
              <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Multi-chain roadmap</div>
              <div className="flex flex-wrap gap-1.5">
                {(["USDC","EURC","cirBTC","ETH","SOL","BNB","BTC","MATIC"] as PayToken[]).map(tok => (
                  <div key={tok} className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10.5px] font-semibold border
                    ${TOKENS[tok].status === "live" ? "bg-green/10 border-green/30 text-green"
                    : TOKENS[tok].status === "arc-soon" ? "bg-amber/10 border-amber/30 text-amber"
                    : "bg-surface2 border-white/10 text-muted"}`}>
                    <span>{TOKENS[tok].label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 p-3 bg-amber/10 border-l-4 border-amber text-amber text-xs rounded-r-lg">
              Testnet only. Get USDC/EURC/cirBTC free at{" "}
              <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="font-bold underline">faucet.circle.com</a>.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Checkout() {
  return <Suspense><CheckoutContent /></Suspense>;
}
