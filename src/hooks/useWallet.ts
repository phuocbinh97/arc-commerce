"use client";
import { useState, useEffect, useCallback } from "react";
import { ARC_CHAIN_ID_HEX, ARC_RPC, ARC_EXPLORER } from "@/lib/arc";
import { syncFromServer } from "@/lib/storage";

// Fetch merchant from Redis and cache in localStorage so all pages load instantly
async function loadMerchantSession(address: string) {
  try {
    const res = await fetch(`/api/merchants/by-wallet/${address}`);
    if (!res.ok) return;
    const { merchant } = await res.json();
    if (!merchant) return;
    localStorage.setItem("arcMerchantSession", JSON.stringify({
      merchantId: merchant.merchantId,
      name: merchant.name,
      wallet: merchant.wallet,
    }));
    localStorage.setItem("arcCommerceSettings", JSON.stringify({
      businessName: merchant.name,
      merchantId: merchant.merchantId,
      merchantWallet: merchant.wallet,
      hubContract: process.env.NEXT_PUBLIC_HUB_CONTRACT || "",
    }));
  } catch {}
}

function detectWalletName(provider: any): string {
  if (!provider) return "Wallet";
  if (provider.isRabby) return "Rabby";
  if (provider.isRainbow) return "Rainbow";
  if (provider.isCoinbaseWallet) return "Coinbase Wallet";
  if (provider.isBraveWallet) return "Brave Wallet";
  if (provider.isMetaMask) return "MetaMask";
  if (provider.isWalletConnect) return "WalletConnect";
  return "Wallet";
}

// Find the right injected provider by wallet name, using providers[] if available
function getProviderByName(name: string): any {
  const eth = (window as any).ethereum;
  if (!eth) return null;
  const list: any[] = eth.providers || [eth];
  switch (name) {
    case "MetaMask":      return list.find((p: any) => p.isMetaMask && !p.isRainbow && !p.isRabby) || eth;
    case "Rainbow":       return list.find((p: any) => p.isRainbow) || eth;
    case "Rabby":         return list.find((p: any) => p.isRabby) || eth;
    case "Coinbase Wallet": return list.find((p: any) => p.isCoinbaseWallet) || eth;
    case "Brave Wallet":  return list.find((p: any) => p.isBraveWallet) || eth;
    default:              return eth;
  }
}

export function useWallet() {
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [walletName, setWalletName] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("arcWalletName") || "Wallet";
    return "Wallet";
  });

  // Clear all wallet-specific data — called on disconnect or wallet switch
  function clearWalletData() {
    localStorage.removeItem("arcMerchantSession");
    localStorage.removeItem("arcCommerceSettings");
    localStorage.removeItem("arcCheckoutHistory");
    localStorage.removeItem("arcCommerceInvoices");
    localStorage.removeItem("arcWalletName");
    localStorage.removeItem("arcExpectedAddress");
    // Swap/bridge history kept under per-wallet keys — not cleared on disconnect
  }

  const isArcNetwork = chainId.toLowerCase() === ARC_CHAIN_ID_HEX;

  useEffect(() => {
    const rawEth = (window as any).ethereum;
    const manuallyDisconnected = localStorage.getItem("arcWalletDisconnected") === "1";
    const expectedAddr = (localStorage.getItem("arcExpectedAddress") || "").toLowerCase();
    const savedName    = localStorage.getItem("arcWalletName") || "";

    if (manuallyDisconnected) {
      rawEth?.request({ method: "eth_chainId" }).then(setChainId).catch(() => {});
      return;
    }
    if (!expectedAddr) return; // never connected before

    // Collect all providers: EIP-6963 + legacy window.ethereum.providers[]
    async function findProviderByAddress(): Promise<{ provider: any; addr: string } | null> {
      return new Promise(resolve => {
        const found: { provider: any; addr: string } | null = null;
        const candidates: any[] = [];
        const seen = new Set<any>();

        function addCandidate(p: any) {
          if (!p || seen.has(p)) return;
          seen.add(p);
          candidates.push(p);
        }

        // Legacy providers
        if (rawEth) {
          const list: any[] = rawEth.providers || [rawEth];
          list.forEach(addCandidate);
        }

        let resolved = false;
        async function checkAll() {
          for (const p of candidates) {
            try {
              const accs: string[] = await p.request({ method: "eth_accounts" });
              if (accs[0]?.toLowerCase() === expectedAddr) {
                resolved = true;
                resolve({ provider: p, addr: accs[0] });
                return;
              }
            } catch { /* skip */ }
          }
        }

        // Collect EIP-6963 providers then check
        const eip6963Providers: any[] = [];
        function onAnnounce(e: Event) {
          const p = (e as CustomEvent).detail?.provider;
          if (p) { addCandidate(p); eip6963Providers.push(p); }
        }
        window.addEventListener("eip6963:announceProvider", onAnnounce);
        window.dispatchEvent(new Event("eip6963:requestProvider"));

        // Wait 300ms for wallets to announce, then check all
        setTimeout(async () => {
          window.removeEventListener("eip6963:announceProvider", onAnnounce);
          if (!resolved) {
            await checkAll();
            if (!resolved) resolve(found);
          }
        }, 300);
      });
    }

    findProviderByAddress().then(async (found) => {
      if (!found) return; // address not found in any provider — stay disconnected
      const { provider, addr } = found;
      const name = savedName || detectWalletName(provider);
      if (!savedName) { localStorage.setItem("arcWalletName", name); setWalletName(name); }
      setAccount(addr); setIsConnected(true);
      provider.request({ method: "eth_chainId" }).then(setChainId).catch(() => {});
      await syncFromServer(addr);
      if (!localStorage.getItem("arcMerchantSession")) loadMerchantSession(addr);
      provider.on?.("accountsChanged", (accs: string[]) => {
        clearWalletData();
        localStorage.removeItem("arcExpectedAddress");
        if (accs[0]) { localStorage.removeItem("arcWalletDisconnected"); setAccount(accs[0]); setIsConnected(true); }
        else { localStorage.setItem("arcWalletDisconnected", "1"); setAccount(""); setIsConnected(false); }
      });
      provider.on?.("chainChanged", setChainId);
    }).catch(() => {});
  }, []);

  // connectWithProvider: called by WalletModal after user picks a wallet
  const connectWithProvider = useCallback(async (provider: any, addr: string, name?: string) => {
    localStorage.removeItem("arcWalletDisconnected");
    clearWalletData();
    const cid = await provider.request({ method: "eth_chainId" }).catch(() => "0x0");
    const detectedName = name || detectWalletName(provider);
    localStorage.setItem("arcWalletName", detectedName);
    localStorage.setItem("arcExpectedAddress", addr.toLowerCase());
    setAccount(addr); setChainId(cid); setIsConnected(true); setWalletName(detectedName);
    // Listen on the chosen provider so events fire correctly
    provider.on?.("accountsChanged", (accs: string[]) => {
      if (accs[0]) { setAccount(accs[0]); }
      else { clearWalletData(); localStorage.setItem("arcWalletDisconnected", "1"); setAccount(""); setIsConnected(false); }
    });
    provider.on?.("chainChanged", setChainId);
    await syncFromServer(addr);
    await loadMerchantSession(addr);
  }, []);

  const connect = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth) throw new Error("Install MetaMask first.");
    const wasDisconnected = localStorage.getItem("arcWalletDisconnected") === "1";
    localStorage.removeItem("arcWalletDisconnected");
    const accs = await eth.request({ method: "eth_requestAccounts" });
    const cid = await eth.request({ method: "eth_chainId" });
    if (wasDisconnected) {
      clearWalletData();
    }
    setAccount(accs[0]); setChainId(cid); setIsConnected(true);
    await syncFromServer(accs[0]);
    await loadMerchantSession(accs[0]);
    if (wasDisconnected) { window.location.reload(); }
    return accs[0] as string;
  }, []);

  const switchToArc = useCallback(async () => {
    const eth = getProviderByName(walletName) || (window as any).ethereum;
    if (!eth) return;
    const addParams = [{
      chainId: ARC_CHAIN_ID_HEX,
      chainName: "Arc Testnet",
      nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
      rpcUrls: [ARC_RPC],
      blockExplorerUrls: [ARC_EXPLORER],
      iconUrls: ["https://nexmer.xyz/arc-icon.png"],
    }];
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_CHAIN_ID_HEX }] });
    } catch (switchErr: any) {
      // 4902 = chain not added; other wallets (Rainbow, Rabby) may use different codes
      // Always attempt wallet_addEthereumChain — it's idempotent (switches if already added)
      try {
        await eth.request({ method: "wallet_addEthereumChain", params: addParams });
      } catch (addErr: any) {
        // wallet_addEthereumChain succeeded but resolved as rejection on some wallets — ignore
        // only re-throw if it looks like a real user rejection
        const msg: string = addErr?.message || "";
        if (addErr?.code === 4001 || msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("denied")) {
          throw addErr;
        }
        // Otherwise silently continue — wallet may have added it despite the error
      }
      // After add attempt, switch explicitly in case wallet didn't auto-switch
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_CHAIN_ID_HEX }] });
      } catch { /* already on Arc or switch fired by wallet — ignore */ }
    }
    const cid = await eth.request({ method: "eth_chainId" });
    setChainId(cid);
  }, []);

  const getUsdcBalance = useCallback(async (addr?: string): Promise<string> => {
    const eth = getProviderByName(walletName) || (window as any).ethereum;
    const target = addr || account;
    if (!eth || !target) return "0.00";
    try {
      const USDC = "0x3600000000000000000000000000000000000000";
      const data = "0x70a08231" + target.toLowerCase().replace("0x","").padStart(64,"0");
      const raw = await eth.request({ method: "eth_call", params: [{ to: USDC, data }, "latest"] });
      const bal6 = BigInt(raw);
      return (Number(bal6) / 1_000_000).toFixed(2);
    } catch { return "0.00"; }
  }, [account]);

  const disconnect = useCallback(() => {
    // Revoke wallet permissions so next connect always prompts the user
    const eth = getProviderByName(walletName) || (window as any).ethereum;
    if (eth) {
      eth.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }).catch(() => {});
    }
    clearWalletData();
    localStorage.setItem("arcWalletDisconnected", "1");
    setAccount(""); setIsConnected(false);
  }, [walletName]);

  return { account, chainId, isConnected, isArcNetwork, walletName, connect, connectWithProvider, switchToArc, getUsdcBalance, disconnect };
}
