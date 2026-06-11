"use client";
import { useState, useEffect, useCallback } from "react";
import { ARC_CHAIN_ID_HEX, ARC_RPC, ARC_EXPLORER } from "@/lib/arc";

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
    localStorage.removeItem("arcBridgeHistory");
    localStorage.removeItem("arcWalletName");
  }

  const isArcNetwork = chainId.toLowerCase() === ARC_CHAIN_ID_HEX;

  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth) return;
    // Don't auto-connect if user explicitly disconnected
    const manuallyDisconnected = localStorage.getItem("arcWalletDisconnected") === "1";
    if (!manuallyDisconnected) {
      eth.request({ method: "eth_accounts" }).then((accs: string[]) => {
        if (accs[0]) {
          const saved = localStorage.getItem("arcWalletName");
          if (!saved) { const n = detectWalletName(eth); localStorage.setItem("arcWalletName", n); setWalletName(n); }
          setAccount(accs[0]); setIsConnected(true);
          // Restore merchant session if not already cached
          if (!localStorage.getItem("arcMerchantSession")) {
            loadMerchantSession(accs[0]);
          }
        }
      }).catch(() => {});
    }
    eth.request({ method: "eth_chainId" }).then(setChainId).catch(() => {});
    eth.on?.("accountsChanged", (accs: string[]) => {
      clearWalletData();
      if (accs[0]) {
        localStorage.removeItem("arcWalletDisconnected");
        setAccount(accs[0]); setIsConnected(true);
        window.location.reload();
      } else {
        localStorage.setItem("arcWalletDisconnected", "1");
        setAccount(""); setIsConnected(false);
        window.location.reload();
      }
    });
    eth.on?.("chainChanged", setChainId);
  }, []);

  // connectWithProvider: called by WalletModal after user picks a wallet
  const connectWithProvider = useCallback(async (provider: any, addr: string, name?: string) => {
    localStorage.removeItem("arcWalletDisconnected");
    clearWalletData();
    const cid = await provider.request({ method: "eth_chainId" }).catch(() => "0x0");
    const detectedName = name || detectWalletName(provider);
    localStorage.setItem("arcWalletName", detectedName);
    setAccount(addr); setChainId(cid); setIsConnected(true); setWalletName(detectedName);
    await loadMerchantSession(addr);
    window.location.reload();
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
    await loadMerchantSession(accs[0]);
    if (wasDisconnected) { window.location.reload(); }
    return accs[0] as string;
  }, []);

  const switchToArc = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth) return;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_CHAIN_ID_HEX }] });
    } catch (e: any) {
      if (e.code === 4902) {
        await eth.request({ method: "wallet_addEthereumChain", params: [{
          chainId: ARC_CHAIN_ID_HEX, chainName: "Arc Testnet",
          nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
          rpcUrls: [ARC_RPC], blockExplorerUrls: [ARC_EXPLORER],
        }]});
      } else throw e;
    }
    const cid = await eth.request({ method: "eth_chainId" });
    setChainId(cid);
  }, []);

  const getUsdcBalance = useCallback(async (addr?: string): Promise<string> => {
    const eth = (window as any).ethereum;
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
    clearWalletData();
    localStorage.setItem("arcWalletDisconnected", "1");
    setAccount(""); setIsConnected(false);
  }, []);

  return { account, chainId, isConnected, isArcNetwork, walletName, connect, connectWithProvider, switchToArc, getUsdcBalance, disconnect };
}
