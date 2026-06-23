"use client";
import { useState } from "react";

const WC_PROJECT_ID = "ccbfb71f173e3e8a48f7d28bea0cf206";
const ARC_CHAIN_ID = 5042002;

interface WalletOption {
  id: string;
  name: string;
  icon: string;
  check: () => boolean;
  connect: () => Promise<any>;
}

function getInjectedProvider(flag?: string): any {
  const eth = (window as any).ethereum;
  if (!eth) return null;
  if (!flag) return eth;
  const list: any[] = eth.providers || [eth];
  if (flag === "isMetaMask") {
    // Rainbow, Rabby, Brave all set isMetaMask=true for compat — exclude them
    return list.find((p: any) => p.isMetaMask && !p.isRainbow && !p.isRabby && !p.isBraveWallet && !p.isCoinbaseWallet) || null;
  }
  return list.find((p: any) => p[flag]) || null;
}

async function connectInjected(provider: any): Promise<string> {
  const accs = await provider.request({ method: "eth_requestAccounts" });
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
      url: "https://arcpay-desk.vercel.app",
      icons: ["https://arcpay-desk.vercel.app/favicon.ico"],
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
  const [error, setError] = useState("");

  const WALLETS: WalletOption[] = [
    {
      id: "metamask",
      name: "MetaMask",
      icon: "https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg",
      check: () => !!getInjectedProvider("isMetaMask"),
      connect: async () => {
        const p = getInjectedProvider("isMetaMask") || getInjectedProvider();
        if (!p) throw new Error("MetaMask not found.");
        return { provider: p, account: await connectInjected(p) };
      },
    },
    {
      id: "coinbase",
      name: "Coinbase Wallet",
      icon: "https://avatars.githubusercontent.com/u/18060234?s=200&v=4",
      check: () => !!getInjectedProvider("isCoinbaseWallet") || !!(window as any).coinbaseWalletExtension,
      connect: async () => {
        const p = getInjectedProvider("isCoinbaseWallet") || (window as any).coinbaseWalletExtension;
        return { provider: p, account: await connectInjected(p) };
      },
    },
    {
      id: "rainbow",
      name: "Rainbow",
      icon: "https://avatars.githubusercontent.com/u/48327834?s=200&v=4",
      check: () => !!getInjectedProvider("isRainbow"),
      connect: async () => {
        const p = getInjectedProvider("isRainbow") || getInjectedProvider();
        return { provider: p, account: await connectInjected(p) };
      },
    },
    {
      id: "rabby",
      name: "Rabby",
      icon: "https://avatars.githubusercontent.com/u/90115530?s=200&v=4",
      check: () => !!getInjectedProvider("isRabby"),
      connect: async () => {
        const p = getInjectedProvider("isRabby") || getInjectedProvider();
        return { provider: p, account: await connectInjected(p) };
      },
    },
    {
      id: "brave",
      name: "Brave Wallet",
      icon: "https://avatars.githubusercontent.com/u/12301619?s=200&v=4",
      check: () => !!getInjectedProvider("isBraveWallet"),
      connect: async () => {
        const p = getInjectedProvider("isBraveWallet") || getInjectedProvider();
        return { provider: p, account: await connectInjected(p) };
      },
    },
    {
      id: "walletconnect",
      name: "WalletConnect",
      icon: "https://avatars.githubusercontent.com/u/37784886?s=200&v=4",
      check: () => true, // always available
      connect: async () => connectWalletConnect(),
    },
  ];

  async function handleConnect(wallet: WalletOption) {
    setError("");
    setConnecting(wallet.id);
    try {
      const { provider, account } = await wallet.connect();
      onConnect(provider, account, wallet.name);
    } catch (e: any) {
      setError(e?.message || "Connection failed");
      setConnecting(null);
    }
  }

  const installed = WALLETS.filter(w => w.id !== "walletconnect" && w.check());
  const others = WALLETS.filter(w => w.id !== "walletconnect" && !w.check());
  const wc = WALLETS.find(w => w.id === "walletconnect")!;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-surface border border-white/14 rounded-2xl shadow-2xl w-[400px] max-h-[90vh] overflow-y-auto">
        {/* Header */}
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
          {/* Installed wallets */}
          {installed.length > 0 && (
            <>
              <div className="text-[11px] font-semibold text-muted uppercase tracking-wider px-1 mb-1">Installed</div>
              {installed.map(w => (
                <WalletButton key={w.id} wallet={w} connecting={connecting} onConnect={handleConnect} installed />
              ))}
            </>
          )}

          {/* WalletConnect */}
          <div className={installed.length > 0 ? "mt-1" : ""}>
            {installed.length > 0 && <div className="text-[11px] font-semibold text-muted uppercase tracking-wider px-1 mb-2 mt-2">Other options</div>}
            <WalletButton wallet={wc} connecting={connecting} onConnect={handleConnect} installed />
          </div>

          {/* Not installed */}
          {others.length > 0 && (
            <>
              <div className="text-[11px] font-semibold text-muted uppercase tracking-wider px-1 mt-2 mb-1">Not installed</div>
              {others.map(w => (
                <WalletButton key={w.id} wallet={w} connecting={connecting} onConnect={handleConnect} installed={false} />
              ))}
            </>
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

function WalletButton({ wallet, connecting, onConnect, installed }: {
  wallet: WalletOption;
  connecting: string | null;
  onConnect: (w: WalletOption) => void;
  installed: boolean;
}) {
  const isLoading = connecting === wallet.id;
  const disabled = !!connecting || (!installed && wallet.id !== "walletconnect");

  return (
    <button
      onClick={() => installed || wallet.id === "walletconnect" ? onConnect(wallet) : window.open("https://metamask.io", "_blank")}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left
        ${isLoading ? "bg-accent/10 border-accent/30" : "bg-surface2 border-white/8 hover:border-white/20 hover:bg-surface"}
        ${disabled && !isLoading ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <img src={wallet.icon} alt={wallet.name} width={36} height={36} className="rounded-xl shrink-0" />
      <div className="flex-1">
        <div className="font-semibold text-[13.5px]">{wallet.name}</div>
        <div className="text-[11.5px] text-muted">
          {isLoading ? "Connecting…" : wallet.id === "walletconnect" ? "Scan QR with any wallet" : installed ? "Ready to connect" : "Not installed"}
        </div>
      </div>
      {isLoading && (
        <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
      )}
      {!isLoading && installed && (
        <div className="w-2 h-2 rounded-full bg-green shrink-0" />
      )}
    </button>
  );
}
