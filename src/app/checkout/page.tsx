"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useCheckout } from "@/hooks/useCheckout";
import { formatUsdc, shortAddr, ARC_EXPLORER, EURC_ADDRESS } from "@/lib/arc";
import { getSettings, getInvoices } from "@/lib/storage";
import WalletModal from "@/components/WalletModal";
import { SUPPORTED_CHAINS, getChainByChainId, parseChainId, fetchUsdcBalance, ARC_CHAIN, type ChainConfig } from "@/lib/multichain";

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
  bridging:             "Bridging USDC to Arc…",
  "waiting-bridge":     "Waiting for USDC to arrive on Arc…",
  "switching-network":  "Switching to Arc network…",
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

function ChainDropdown({ chains, selected, balances, amount, switching, onSelect }: {
  chains: ChainConfig[]; selected: ChainConfig | null;
  balances: Record<string, string>; amount: string;
  switching: boolean; onSelect: (c: ChainConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  const cur = selected ?? chains[0];
  const bal = balances[cur?.key ?? ""] ?? "…";
  const hasBal = bal !== "—" && bal !== "…" && parseFloat(bal) >= parseFloat(amount);
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)} disabled={switching}
        className="w-full flex items-center gap-3 px-3 py-2.5 bg-surface2 border border-white/14 rounded-2xl hover:border-white/30 transition-colors">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cur?.color ?? "#7d8590" }} />
        <div className="flex-1 text-left">
          <div className="text-[13px] font-semibold text-ink">{cur?.shortLabel ?? "Select chain"}</div>
        </div>
        <div className={`font-mono text-[11.5px] mr-1 ${hasBal ? "text-green" : "text-muted/60"}`}>{bal} USDC</div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted shrink-0">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-surface border border-white/14 rounded-xl shadow-2xl overflow-hidden">
          {chains.map(c => {
            const b = balances[c.key] ?? "…";
            const suf = b !== "—" && b !== "…" && parseFloat(b) >= parseFloat(amount);
            const isSelected = cur?.key === c.key;
            return (
              <button key={c.key} disabled={switching}
                onClick={() => { onSelect(c); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 border-b border-white/6 last:border-0 hover:bg-surface2 transition-colors text-left
                  ${isSelected ? "bg-accent/8" : ""}`}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                <div className="flex-1">
                  <div className="text-[12.5px] font-semibold text-ink">{c.shortLabel}</div>
                </div>
                <div className={`font-mono text-[11px] ${suf ? "text-green" : "text-muted/50"}`}>{b} USDC</div>
                {isSelected && <span className="text-accent text-[11px] font-bold">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TokenDropdown({ value, onChange, balances }: { value: PayToken; onChange: (t: PayToken) => void; balances: Partial<Record<PayToken, string>> }) {
  const [open, setOpen] = useState(false);
  const meta = TOKENS[value];
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 bg-surface2 border border-white/14 rounded-2xl hover:border-white/30 transition-colors">
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

  const { account, isConnected, isArcNetwork, connect, connectWithProvider, switchToArc, disconnect, getProvider } = useWallet();
  const [showWalletModal, setShowWalletModal] = useState(false);
  const { step, txHash, error, pay, bridgeAndPay, reset } = useCheckout();

  const [usdcBalance, setUsdcBalance] = useState("—");
  const [eurcBalance, setEurcBalance] = useState("—");
  const [payToken, setPayToken]       = useState<PayToken>("USDC");
  const [payerName, setPayerName]     = useState("");
  const [feeEst, setFeeEst]           = useState<{ gas: string; total: string } | null>(null);

  // Multi-chain state
  const [customerChain, setCustomerChain]     = useState<ChainConfig | null>(null);
  const [rawChainId, setRawChainId]           = useState<number | null>(null);
  const [crossChainBal, setCrossChainBal]     = useState("—");
  const [bridgeMode, setBridgeMode]           = useState(false);
  const [allBalances, setAllBalances]         = useState<Record<string, string>>({});
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [selectedPayChain, setSelectedPayChain] = useState<ChainConfig | null>(null);
  const [switching, setSwitching]             = useState(false);
  const [bridgeElapsed, setBridgeElapsed]     = useState(0);
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


  // Invoice expiry / paid check
  const [invoiceExpired, setInvoiceExpired] = useState(false);
  const [invoiceAlreadyPaid, setInvoiceAlreadyPaid] = useState(false);
  useEffect(() => {
    if (!orderId.startsWith("INV-")) return;

    // 1. Check local first (merchant browser — instant)
    const invs = getInvoices();
    const local = invs.find(i => i.id === orderId && parseFloat(i.amount) === parseFloat(amount))
                ?? invs.find(i => i.id === orderId);
    if (local) {
      if (local.status === "paid") { setInvoiceAlreadyPaid(true); return; }
      if (local.status === "void") { setInvoiceExpired(true); return; }
      if (local.expiresAt && Date.now() > local.expiresAt) { setInvoiceExpired(true); return; }
      return; // found locally and valid
    }

    // 2. Customer browser — check Redis via API
    fetch(`/api/invoices/lookup?invoiceId=${orderId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.invoice) return;
        const inv = data.invoice;
        if (inv.status === "paid") { setInvoiceAlreadyPaid(true); return; }
        if (inv.status === "void") { setInvoiceExpired(true); return; }
        if (inv.expiresAt && Date.now() > inv.expiresAt) setInvoiceExpired(true);
      })
      .catch(() => {});
  }, [orderId, amount]);

  // Detect customer's current chain — read directly from window.ethereum
  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth) return;
    const detect = () => {
      eth.request({ method: "eth_chainId" }).then((hex: string) => {
        const id = parseChainId(hex);
        setRawChainId(id);
        setCustomerChain(getChainByChainId(id) || null);
      }).catch(() => {});
    };
    detect();
    const handler = (hex: string) => {
      const id = parseChainId(hex);
      setRawChainId(id);
      setCustomerChain(getChainByChainId(id) || null);
      // Do NOT reset bridgeMode here — user may have selected a non-Arc chain intentionally
    };
    eth.on?.("chainChanged", handler);
    // Also poll every 2s as fallback (some wallets don't fire chainChanged)
    const poll = setInterval(detect, 2000);
    return () => { eth.removeListener?.("chainChanged", handler); clearInterval(poll); };
  }, []);

  // Fetch USDC balance on the currently active chain (for bridge flow)
  useEffect(() => {
    if (!account || !customerChain || customerChain.key === ARC_CHAIN.key) {
      setCrossChainBal("—");
      return;
    }
    fetchUsdcBalance(customerChain, account).then(setCrossChainBal);
  }, [account, customerChain]);

  // Fetch USDC balances on ALL chains so customer can choose where to pay from
  useEffect(() => {
    if (!account) return;
    setLoadingBalances(true);
    Promise.all(
      SUPPORTED_CHAINS.map(c =>
        fetchUsdcBalance(c, account).then(bal => ({ key: c.key, bal }))
      )
    ).then(results => {
      const bals: Record<string, string> = {};
      results.forEach(r => { bals[r.key] = r.bal; });
      setAllBalances(bals);
      setLoadingBalances(false);
    });
  }, [account]);

  useEffect(() => {
    if (!account) return;
    // Use Arc RPC directly — avoids wrong-wallet/wrong-network issues
    const ARC_RPC = process.env.NEXT_PUBLIC_ARC_RPC || "https://rpc.testnet.arc.network";
    const fetchBal = async (tokenAddr: string) => {
      const data = "0x70a08231" + account.toLowerCase().replace("0x", "").padStart(64, "0");
      const res = await fetch(ARC_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: tokenAddr, data }, "latest"] }),
      });
      const json = await res.json();
      if (!json.result || json.result === "0x") return "0.00";
      return (Number(BigInt(json.result)) / 1_000_000).toFixed(2);
    };
    fetchBal("0x3600000000000000000000000000000000000000").then(setUsdcBalance).catch(() => setUsdcBalance("0.00"));
    fetchBal(EURC_ADDRESS).then(setEurcBalance).catch(() => setEurcBalance("0.00"));
  }, [account]);

  // Pre-flight: estimate gas fee in USDC (Arc uses USDC as gas token)
  useEffect(() => {
    if (!isConnected || !isArcNetwork) { setFeeEst(null); return; }
    const eth = getProvider();
    if (!eth) return;
    eth.request({ method: "eth_gasPrice" }).then((hex: string) => {
      const gasPrice  = BigInt(hex);
      const totalGas  = 600_000n; // approve (~100k) + memo-wrapped payToMerchant (~500k)
      const feeUnits  = gasPrice * totalGas;             // in 1e-18 units (Arc native gas)
      const feeUsdc   = Number(feeUnits) / 1e18;         // Arc gas is 18-decimal internally
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

  // Show banner whenever wallet is NOT on Arc (rawChainId != 5042002), regardless of whitelist
  const ARC_CHAIN_ID_NUM = 5042002;
  const ARC_HEX = "0x4CEF52";
  const CHAIN_HEX: Record<string, string> = {
    Arc_Testnet:          "0x4CEF52",
    Ethereum_Sepolia:     "0xaa36a7",
    Base_Sepolia:         "0x14a34",
    Arbitrum_Sepolia:     "0x66eee",
    Optimism_Sepolia:     "0xaa37dc",
    Polygon_Amoy_Testnet: "0x13882",
    Avalanche_Fuji:       "0xa869",
  };

  async function switchToChain(chain: ChainConfig) {
    const eth = (window as any).ethereum;
    if (!eth) return;
    setSwitching(true);
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX[chain.key] }] });
    } catch (e: any) {
      if (e.code === 4902) {
        // Chain not added yet — add it
        const rpcMap: Record<string, object> = {
          Arc_Testnet: { chainId: "0x4CEF52", chainName: "Arc Testnet", rpcUrls: ["https://rpc.testnet.arc.network"], nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, blockExplorerUrls: ["https://testnet.arcscan.app"] },
          Base_Sepolia: { chainId: "0x14a34", chainName: "Base Sepolia", rpcUrls: ["https://sepolia.base.org"], nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, blockExplorerUrls: ["https://sepolia.basescan.org"] },
          Arbitrum_Sepolia: { chainId: "0x66eee", chainName: "Arbitrum Sepolia", rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"], nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, blockExplorerUrls: ["https://sepolia.arbiscan.io"] },
          Optimism_Sepolia: { chainId: "0xaa37dc", chainName: "Optimism Sepolia", rpcUrls: ["https://sepolia.optimism.io"], nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, blockExplorerUrls: ["https://sepolia-optimism.etherscan.io"] },
          Polygon_Amoy_Testnet: { chainId: "0x13882", chainName: "Polygon Amoy", rpcUrls: ["https://rpc-amoy.polygon.technology"], nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 }, blockExplorerUrls: ["https://amoy.polygonscan.com"] },
          Avalanche_Fuji: { chainId: "0xa869", chainName: "Avalanche Fuji", rpcUrls: ["https://api.avax-test.network/ext/bc/C/rpc"], nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 }, blockExplorerUrls: ["https://testnet.snowtrace.io"] },
        };
        if (rpcMap[chain.key]) await eth.request({ method: "wallet_addEthereumChain", params: [rpcMap[chain.key]] });
      }
    }
    setSwitching(false);
  }

  const isOnNonArcChain = rawChainId != null && rawChainId !== ARC_CHAIN_ID_NUM;
  const isOnNonArcSupportedChain = isOnNonArcChain;
  const chainDisplayName = customerChain?.label ?? `Chain ID ${rawChainId}`;
  const crossChainSufficient = crossChainBal !== "—" && parseFloat(crossChainBal) >= parseFloat(amount);

  async function handlePay() {
    if (!isConnected) { setShowWalletModal(true); return; }
    const payFromChain = selectedPayChain || customerChain;
    if (bridgeMode && payFromChain && payFromChain.key !== ARC_CHAIN.key) {
      await bridgeAndPay({ amount, orderId, memo, payerName: payerName.trim() || undefined, merchantOverride, sourceChainKey: payFromChain.key, provider: (window as any).ethereum }).catch(() => {});
      return;
    }
    // Direct Arc payment
    const eth = (window as any).ethereum;
    if (!eth) return;
    const chainHex = await eth.request({ method: "eth_chainId" });
    if (parseChainId(chainHex) !== ARC_CHAIN_ID_NUM) {
      await switchToChain(ARC_CHAIN);
      return;
    }
    await pay({ amount, orderId, memo, payerName: payerName.trim() || undefined, merchantOverride, payToken: payToken as "USDC" | "EURC", provider: eth }).catch(() => {});
  }

  const isBridging = ["bridging", "waiting-bridge", "switching-network", "approving", "confirming-approve", "paying", "confirming-pay"].includes(step);

  useEffect(() => {
    if (!isBridging) { setBridgeElapsed(0); return; }
    const t = setInterval(() => setBridgeElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [isBridging]);
  const payLabel = (step === "idle" || step === "error")
    ? bridgeMode
      ? `Bridge & Pay from ${selectedPayChain?.shortLabel || customerChain?.shortLabel || "Other Chain"}`
      : payToken === "USDC" ? "Pay with USDC" : `Swap ${activeMeta.label} → USDC & Pay`
    : STEP_LABELS[step];

  const canPay = ["idle", "error"].includes(step)
    && !loadingMerchant
    && !(isConnected && !bridgeMode && !activeSufficient)
    && !(isConnected && !bridgeMode && payToken === "EURC" && !hasGas)
    && !(bridgeMode && !crossChainSufficient);

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
          <button onClick={reset} className="w-full py-3 border border-white/8 rounded-2xl font-semibold text-sm text-ink hover:bg-surface2">← New Payment</button>
        </div>
      </div>
    );
  }

  if (invoiceAlreadyPaid) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-6">
        <div className="bg-surface border border-white/8 rounded-xl p-8 w-full max-w-sm text-center shadow-2xl">
          <div className="w-14 h-14 rounded-full bg-green/15 flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h1 className="text-xl font-bold text-green mb-2">Đã thanh toán</h1>
          <p className="text-muted text-sm mb-1">Hóa đơn <strong className="text-ink">{orderId}</strong> đã được thanh toán thành công.</p>
          <p className="text-muted text-sm">Cảm ơn bạn đã thanh toán!</p>
        </div>
      </div>
    );
  }

  if (invoiceExpired) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-6">
        <div className="bg-surface border border-white/8 rounded-xl p-8 w-full max-w-sm text-center shadow-2xl">
          <div className="text-5xl mb-3">⏱</div>
          <h1 className="text-xl font-bold text-amber mb-2">Invoice Expired</h1>
          <p className="text-muted text-sm mb-2">Invoice <strong className="text-ink">{orderId}</strong> is no longer valid.</p>
          <p className="text-muted text-sm">Please contact the merchant to request a new payment link.</p>
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
            {showWalletModal && (
              <WalletModal
                onConnect={(provider, addr, name) => { setShowWalletModal(false); connectWithProvider(provider, addr, name); }}
                onClose={() => setShowWalletModal(false)}
              />
            )}
            <div className="flex items-center justify-between mb-4 p-3 bg-surface2 border border-white/8 rounded-2xl text-sm">
              {isConnected ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green shrink-0" />
                    <span className="text-ink font-mono text-[12.5px]">{shortAddr(account)}</span>
                    {isArcNetwork && <span className="text-[11px] text-accent font-semibold">· Arc Testnet</span>}
                  </div>
                  <button onClick={() => { disconnect(); }}
                    className="text-[11px] text-muted hover:text-red transition-colors font-medium">
                    Change wallet
                  </button>
                </>
              ) : (
                <>
                  <span className="text-muted text-[13px]">Wallet not connected</span>
                  <button onClick={() => setShowWalletModal(true)}
                    className="px-3 py-1.5 bg-accent text-white text-[12px] font-bold rounded-xl hover:bg-accent/90 transition-all">
                    Connect wallet
                  </button>
                </>
              )}
            </div>

            {/* Chain selector — dropdown */}
            {isConnected && (
              <div className="mb-4">
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
                  Pay from
                  {loadingBalances && <span className="ml-2 text-muted/60 normal-case font-normal">fetching balances…</span>}
                </div>
                <ChainDropdown
                  chains={SUPPORTED_CHAINS}
                  selected={selectedPayChain || customerChain}
                  balances={allBalances}
                  amount={amount}
                  switching={switching}
                  onSelect={async (c) => {
                    setSelectedPayChain(c);
                    if (c.key === ARC_CHAIN.key) {
                      setBridgeMode(false);
                    } else {
                      setBridgeMode(true);
                    }
                  }}
                />
                {/* Switch network prompt if selected != wallet chain */}
                {selectedPayChain && customerChain && selectedPayChain.key !== customerChain.key && (
                  <button
                    disabled={switching}
                    onClick={() => switchToChain(selectedPayChain)}
                    className="mt-2 w-full py-2 rounded-xl border border-amber/30 bg-amber/8 text-amber text-[12.5px] font-semibold hover:bg-amber/15 transition-colors disabled:opacity-50">
                    {switching ? "Switching…" : `Switch wallet to ${selectedPayChain.shortLabel}`}
                  </button>
                )}
                {selectedPayChain && selectedPayChain.key !== ARC_CHAIN.key && (
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-muted px-1">
                    <span className="px-2 py-0.5 rounded-full border border-white/8 bg-surface2 text-[10.5px]">{selectedPayChain.shortLabel}</span>
                    <span>→ Circle CCTP bridge →</span>
                    <span className="px-2 py-0.5 rounded-full border border-accent/20 bg-accent/10 text-accent text-[10.5px]">Arc</span>
                    <span>→ Merchant ✓</span>
                  </div>
                )}
              </div>
            )}

            {/* Bridge mode active banner — hidden during active bridge steps */}
            {isConnected && bridgeMode && !isOnNonArcSupportedChain && !isBridging && (
              <div className="mb-4 px-4 py-3 bg-purple/8 border border-purple/20 rounded-2xl">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: customerChain?.color ?? "#a371f7" }} />
                  <span className="text-[12.5px] font-semibold text-ink">Wallet on {chainDisplayName}</span>
                  <button onClick={() => setBridgeMode(false)} className="ml-auto text-[11px] text-muted hover:text-ink">✕</button>
                </div>
              </div>
            )}

            {/* Legacy: non-Arc chain banner */}
            {isOnNonArcSupportedChain && !bridgeMode && false && (
              <div className="mb-4 px-4 py-3 bg-purple/8 border border-purple/20 rounded-2xl">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: customerChain?.color ?? "#a371f7" }} />
                    <span className="text-[12.5px] font-semibold text-ink">Wallet on {chainDisplayName}</span>
                  </div>
                  {customerChain && <span className="text-[11px] text-muted font-mono">{crossChainBal} USDC</span>}
                </div>
                {customerChain ? (
                  <>
                    <p className="text-[11px] text-muted mb-2.5">
                      Pay directly from {customerChain.shortLabel} — USDC will auto-bridge to Arc via Circle CCTP (~25s).
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => setBridgeMode(true)}
                        disabled={!crossChainSufficient}
                        className="flex-1 py-2 bg-purple/20 border border-purple/30 text-[#c084fc] text-[12px] font-bold rounded-xl hover:bg-purple/30 transition-all disabled:opacity-40">
                        🌉 Pay from {customerChain.shortLabel} (Bridge & Pay)
                      </button>
                      <button onClick={switchToArc}
                        className="px-3 py-2 bg-surface2 border border-white/8 text-muted text-[12px] rounded-xl hover:bg-surface2/80 transition-all">
                        Switch to Arc
                      </button>
                    </div>
                    {!crossChainSufficient && (
                      <p className="text-[11px] text-red mt-1.5">
                        Insufficient USDC on {customerChain.shortLabel} to pay {amount} USDC.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-[11px] text-muted mb-2.5">
                      This chain is not supported for Bridge & Pay. Please switch to Arc Testnet to pay.
                    </p>
                    <button onClick={switchToArc}
                      className="w-full py-2 bg-accent text-white text-[12px] font-bold rounded-xl hover:bg-accent/90 transition-all">
                      Switch to Arc Testnet
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Bridge mode active */}
            {bridgeMode && (selectedPayChain || customerChain) && (
              <div className="mb-4 px-4 py-3 bg-purple/8 border border-purple/25 rounded-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: (selectedPayChain || customerChain)!.color }} />
                    <span className="text-[12.5px] font-bold text-[#c084fc]">
                      Bridge & Pay from {(selectedPayChain || customerChain)!.label}
                    </span>
                  </div>
                  {!isBridging && <button onClick={() => setBridgeMode(false)} className="text-[11px] text-muted hover:text-ink">✕ Cancel</button>}
                </div>
                <div className="flex items-center gap-2 mt-2 text-[11px] text-muted">
                  <span className="px-2 py-0.5 rounded-full bg-surface2 border border-white/8">{(selectedPayChain || customerChain)!.shortLabel}</span>
                  <span>→ CCTP bridge →</span>
                  <span className="px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-accent">Arc</span>
                  <span>→</span>
                  <span className="text-green font-semibold">Merchant ✓</span>
                </div>
                {isBridging && (() => {
                  // Estimated total: 15s bridge tx + 90s CCTP relay + 15s Arc pay = ~120s
                  const EST_TOTAL = 120;
                  const pct = Math.min(bridgeElapsed / EST_TOTAL * 100, 97);
                  const remaining = Math.max(EST_TOTAL - bridgeElapsed, 0);
                  const remStr = remaining > 0
                    ? `~${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")} left`
                    : "almost done…";
                  return (
                    <div className="mt-2.5 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5 text-purple-300">
                          <span className="animate-spin">⟳</span>
                          <span>{STEP_LABELS[step]}</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-muted tabular-nums">
                          <span>{Math.floor(bridgeElapsed / 60)}:{String(bridgeElapsed % 60).padStart(2, "0")}</span>
                          <span className="text-muted/50">·</span>
                          <span className={remaining === 0 ? "text-green" : "text-muted"}>{remStr}</span>
                        </div>
                      </div>
                      <div className="h-1 bg-white/6 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-400/60 rounded-full transition-all duration-1000"
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Merchant */}
            <div className="mb-5 p-3.5 bg-surface2 border border-white/8 rounded-2xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-accent grid place-items-center text-white font-bold text-lg shrink-0">{displayName.charAt(0).toUpperCase()}</div>
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

              {bridgeMode && selectedPayChain ? (
                /* Bridge mode: show source chain USDC, not Arc */
                <div className="w-full flex items-center gap-3 px-3 py-2.5 bg-surface2 border border-purple/30 rounded-2xl">
                  <div className="w-7 h-7 rounded-full grid place-items-center text-[13px] font-bold shrink-0 bg-[#2775ca] text-white">$</div>
                  <div className="flex-1 text-left">
                    <div className="text-[13.5px] font-semibold text-ink">USDC</div>
                    <div className="text-[10.5px] text-muted">{selectedPayChain.label}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-mono text-muted">{crossChainBal !== "—" ? `${crossChainBal} USDC` : "fetching…"}</div>
                  </div>
                </div>
              ) : (
                <TokenDropdown value={payToken} onChange={setPayToken} balances={{ USDC: usdcBalance, EURC: eurcBalance }} />
              )}

              {!bridgeMode && payToken === "EURC" && (
                <div className="mt-2 px-3 py-2 bg-surface2 border border-white/8 rounded-2xl text-[11.5px] text-muted">
                  ~{(parseFloat(amount) * 1.01).toFixed(2)} EURC will be swapped → {amount} USDC via Arc App Kit.
                </div>
              )}
              {!bridgeMode && TOKENS[payToken].status === "crosschain-soon" && (
                <div className="mt-2 px-3 py-2 bg-purple/10 border border-purple/20 rounded-2xl text-[11.5px] text-[#a371f7]">
                  🔗 Cross-chain via LI.FI — coming on Arc Mainnet. {activeMeta.label} → USDC auto-swap.
                </div>
              )}
              {!bridgeMode && payToken === "cirBTC" && (
                <div className="mt-2 px-3 py-2 bg-amber/10 border border-amber/20 rounded-2xl text-[11.5px] text-amber">
                  ⏳ cirBTC swap coming soon on Arc App Kit.
                </div>
              )}
            </div>

            {/* Balance row — hide during active bridge flow */}
            {isConnected && !isBridging && (bridgeMode && selectedPayChain ? (
              <div className={`mb-4 flex items-center justify-between px-3 py-2 rounded-2xl text-sm font-medium
                ${crossChainBal !== "—" && parseFloat(crossChainBal) >= parseFloat(amount)
                  ? "bg-green/10 border border-green/20 text-green"
                  : "bg-red/10 border border-red/20 text-red"}`}>
                <span>Your USDC balance on {selectedPayChain.shortLabel}: {crossChainBal !== "—" ? crossChainBal : "…"}</span>
                <span>{crossChainBal !== "—" && parseFloat(crossChainBal) >= parseFloat(amount) ? "✓ Sufficient" : "✗ Insufficient"}</span>
              </div>
            ) : TOKENS[payToken].status === "live" ? (
              <div className={`mb-4 flex items-center justify-between px-3 py-2 rounded-2xl text-sm font-medium
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
            ) : null)}

            {/* No gas warning */}
            {isConnected && payToken === "EURC" && !hasGas && (
              <div className="mb-4 px-3 py-2.5 bg-amber/10 border border-amber/30 rounded-2xl text-amber text-[12.5px]">
                ⛽ Arc uses USDC as gas. You need at least <strong>~0.01 USDC</strong> for network fees.{" "}
                <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="underline font-semibold">Get free USDC →</a>
              </div>
            )}

            {/* Order fields */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-semibold text-muted uppercase mb-1 block">Amount</label>
                <input value={formatUsdc(amount)} readOnly className="w-full border border-white/8 rounded-2xl px-3 py-2.5 text-sm bg-surface2 text-ink" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted uppercase mb-1 block">Merchant receives</label>
                <input value="USDC" disabled className="w-full border border-white/8 rounded-2xl px-3 py-2.5 text-sm bg-surface2 text-ink" />
              </div>
            </div>
            <div className="mb-3">
              <label className="text-xs font-semibold text-muted uppercase mb-1 block">Order ID</label>
              <input value={orderId} readOnly className="w-full border border-white/8 rounded-2xl px-3 py-2.5 text-sm bg-surface2 text-ink font-mono" />
            </div>
            <div className="mb-3">
              <label className="text-xs font-semibold text-muted uppercase mb-1 block">Your name <span className="normal-case font-normal text-muted">(optional)</span></label>
              <input value={payerName} onChange={e => setPayerName(e.target.value)}
                placeholder="e.g. John Doe"
                className="w-full border border-white/8 rounded-2xl px-3 py-2.5 text-sm bg-surface2 text-ink outline-none focus:border-accent transition-colors" />
            </div>
            {memo && (
              <div className="mb-4">
                <label className="text-xs font-semibold text-muted uppercase mb-1 block">Memo</label>
                <textarea value={memo} readOnly rows={2} className="w-full border border-white/8 rounded-2xl px-3 py-2.5 text-sm bg-surface2 text-ink resize-none" />
              </div>
            )}

            {/* Pre-flight fee estimate */}
            {feeEst && isConnected && isArcNetwork && (
              <div className="mb-3 px-3 py-2.5 bg-surface2 border border-white/8 rounded-2xl text-[12px]">
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

            {error && <div className="mb-3 px-3 py-2 bg-red/10 border border-red/20 rounded-2xl text-red text-sm">{error}</div>}

            <div className="flex gap-2">
              <button onClick={handlePay} disabled={!canPay}
                className="flex-1 py-2.5 bg-accent text-white rounded-2xl font-semibold text-sm disabled:opacity-60 hover:bg-accent/90 transition-colors">
                {payLabel}
              </button>
              <button onClick={switchToArc} className="px-4 py-2.5 border border-white/8 rounded-2xl font-semibold text-sm text-muted hover:bg-surface2">
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

            {/* QR code — scan to open on mobile */}
            <div className="mt-4 pt-4 border-t border-white/8 flex flex-col items-center gap-2">
              <div className="text-[11px] font-semibold text-muted uppercase tracking-wider self-start mb-1">Scan to pay on mobile</div>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}&bgcolor=161b22&color=e6edf3&margin=10`}
                alt="QR code" className="w-[150px] h-[150px] rounded-xl border border-white/8"
              />
              <div className="text-[10.5px] text-muted">Customer scans this to open on phone</div>
            </div>

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
