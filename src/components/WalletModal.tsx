"use client";
import { useState, useEffect } from "react";

const WC_PROJECT_ID = "ccbfb71f173e3e8a48f7d28bea0cf206";
const ARC_CHAIN_ID = 5042002;

// EIP-6963: each wallet announces itself via events with its own isolated provider
interface EIP6963ProviderInfo { uuid: string; name: string; icon: string; rdns: string; }
interface EIP6963Provider { info: EIP6963ProviderInfo; provider: any; }

// Known RDNS → display name mapping
const RDNS_NAMES: Record<string, string> = {
  "io.metamask":        "MetaMask",
  "me.rainbow":         "Rainbow",
  "app.rabby":          "Rabby",
  "com.coinbase.wallet":"Coinbase Wallet",
  "com.brave.wallet":   "Brave Wallet",
};

async function connectInjected(provider: any): Promise<string> {
  try {
    await provider.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
  } catch (e: any) {
    if (e?.code === 4001) throw e;
  }
  const accs = await provider.request({ method: "eth_requestAccounts" });
  if (!accs?.[0]) throw new Error("No account returned from wallet.");
  return accs[0];
}

async function connectWalletConnect(): Promise<{ provider: any; account: string }> {
  const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
  const wc = await EthereumProvider.init({
    projectId: WC_PROJECT_ID,
    chains: [ARC_CHAIN_ID],
    optionalChains: [1, 11155111],
    showQrModal: true,
    metadata: {
      name: "Nexmer",
      description: "USDC Payment Platform on Arc Testnet",
      url: "https://nexmer.xyz",
      icons: ["https://nexmer.xyz/favicon.ico"],
    },
  });
  await wc.connect();
  const accs = await wc.request({ method: "eth_accounts" }) as string[];
  return { provider: wc, account: accs[0] };
}

interface Props {
  onConnect: (provider: any, account: string, walletName: string) => void;
  onClose: () => void;
}

export default function WalletModal({ onConnect, onClose }: Props) {
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError]           = useState("");
  const [eip6963, setEip6963]       = useState<EIP6963Provider[]>([]);

  // Discover wallets via EIP-6963 (each wallet announces its own isolated provider)
  useEffect(() => {
    const discovered: EIP6963Provider[] = [];
    const seen = new Set<string>();

    function onAnnounce(e: Event) {
      const detail = (e as CustomEvent).detail as EIP6963Provider;
      if (!detail?.info?.uuid || seen.has(detail.info.uuid)) return;
      seen.add(detail.info.uuid);
      discovered.push(detail);
      setEip6963([...discovered]);
    }

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    // Request all installed wallets to announce themselves
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Fallback: if no EIP-6963 wallets after 300ms, use window.ethereum
    const timer = setTimeout(() => {
      if (discovered.length === 0) {
        const eth = (window as any).ethereum;
        if (eth) {
          const list: any[] = eth.providers || [eth];
          list.forEach((p, i) => {
            const name = p.isRainbow ? "Rainbow"
              : p.isRabby ? "Rabby"
              : p.isCoinbaseWallet ? "Coinbase Wallet"
              : p.isBraveWallet ? "Brave Wallet"
              : p.isMetaMask ? "MetaMask"
              : `Wallet ${i + 1}`;
            const uuid = name + i;
            if (!seen.has(uuid)) {
              seen.add(uuid);
              discovered.push({ info: { uuid, name, icon: "", rdns: "" }, provider: p });
            }
          });
          setEip6963([...discovered]);
        }
      }
    }, 300);

    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      clearTimeout(timer);
    };
  }, []);

  async function handleEip6963(entry: EIP6963Provider) {
    setError("");
    setConnecting(entry.info.uuid);
    try {
      const account = await connectInjected(entry.provider);
      const name = RDNS_NAMES[entry.info.rdns] || entry.info.name;
      onConnect(entry.provider, account, name);
    } catch (e: any) {
      setError(e?.message || "Connection failed");
      setConnecting(null);
    }
  }

  async function handleWalletConnect() {
    setError("");
    setConnecting("wc");
    try {
      const { provider, account } = await connectWalletConnect();
      onConnect(provider, account, "WalletConnect");
    } catch (e: any) {
      setError(e?.message || "WalletConnect failed");
      setConnecting(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-white/14 rounded-2xl shadow-2xl w-[400px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div>
            <div className="font-bold text-[15px]">Connect a wallet</div>
            <div className="text-[12px] text-muted mt-0.5">Choose your preferred wallet</div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-surface2 grid place-items-center text-muted hover:text-ink transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="p-4 flex flex-col gap-2">
          {/* EIP-6963 discovered wallets */}
          {eip6963.length > 0 && (
            <>
              <div className="text-[11px] font-semibold text-muted uppercase tracking-wider px-1 mb-1">Installed</div>
              {eip6963.map(entry => {
                const isLoading = connecting === entry.info.uuid;
                const name = RDNS_NAMES[entry.info.rdns] || entry.info.name;
                return (
                  <button key={entry.info.uuid}
                    onClick={() => handleEip6963(entry)}
                    disabled={!!connecting}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left
                      ${isLoading ? "bg-accent/10 border-accent/30" : "bg-surface2 border-white/8 hover:border-white/20 hover:bg-surface"}
                      ${connecting && !isLoading ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}>
                    {entry.info.icon
                      ? <img src={entry.info.icon} alt={name} width={36} height={36} className="rounded-xl shrink-0" />
                      : <div className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center text-[18px] shrink-0">🔑</div>
                    }
                    <div className="flex-1">
                      <div className="font-semibold text-[13.5px]">{name}</div>
                      <div className="text-[11.5px] text-muted">{isLoading ? "Connecting…" : "Ready to connect"}</div>
                    </div>
                    {isLoading
                      ? <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
                      : <div className="w-2 h-2 rounded-full bg-green shrink-0" />
                    }
                  </button>
                );
              })}
            </>
          )}

          {/* WalletConnect */}
          <div className={eip6963.length > 0 ? "mt-1" : ""}>
            {eip6963.length > 0 && <div className="text-[11px] font-semibold text-muted uppercase tracking-wider px-1 mb-2 mt-2">Other options</div>}
            <button onClick={handleWalletConnect} disabled={!!connecting}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left
                ${connecting === "wc" ? "bg-accent/10 border-accent/30" : "bg-surface2 border-white/8 hover:border-white/20 hover:bg-surface"}
                ${connecting && connecting !== "wc" ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}>
              <img src="https://avatars.githubusercontent.com/u/37784886?s=200&v=4" alt="WalletConnect" width={36} height={36} className="rounded-xl shrink-0" />
              <div className="flex-1">
                <div className="font-semibold text-[13.5px]">WalletConnect</div>
                <div className="text-[11.5px] text-muted">{connecting === "wc" ? "Connecting…" : "Scan QR with any wallet"}</div>
              </div>
              {connecting === "wc"
                ? <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
                : <div className="w-2 h-2 rounded-full bg-green shrink-0" />
              }
            </button>
          </div>

          {eip6963.length === 0 && !connecting && (
            <div className="py-4 text-center text-[13px] text-muted">Detecting wallets…</div>
          )}

          {error && (
            <div className="mt-2 px-3 py-2 bg-red/10 border border-red/20 rounded-lg text-[12.5px] text-red">{error}</div>
          )}
        </div>

        <div className="px-5 pb-4 text-center text-[11.5px] text-muted">
          New to wallets? <a href="https://metamask.io" target="_blank" rel="noreferrer" className="text-[#6ea8fe] hover:underline">Get MetaMask →</a>
        </div>
      </div>
    </div>
  );
}
