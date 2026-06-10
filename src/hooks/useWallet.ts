"use client";
import { useState, useEffect, useCallback } from "react";
import { ARC_CHAIN_ID_HEX, ARC_RPC, ARC_EXPLORER } from "@/lib/arc";

export function useWallet() {
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  const isArcNetwork = chainId.toLowerCase() === ARC_CHAIN_ID_HEX;

  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth) return;
    eth.request({ method: "eth_accounts" }).then((accs: string[]) => {
      if (accs[0]) { setAccount(accs[0]); setIsConnected(true); }
    }).catch(() => {});
    eth.request({ method: "eth_chainId" }).then(setChainId).catch(() => {});
    eth.on?.("accountsChanged", (accs: string[]) => {
      setAccount(accs[0] || ""); setIsConnected(!!accs[0]);
    });
    eth.on?.("chainChanged", setChainId);
  }, []);

  const connect = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth) throw new Error("Install MetaMask first.");
    const accs = await eth.request({ method: "eth_requestAccounts" });
    const cid = await eth.request({ method: "eth_chainId" });
    setAccount(accs[0]); setChainId(cid); setIsConnected(true);
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
    setAccount(""); setIsConnected(false);
  }, []);

  return { account, chainId, isConnected, isArcNetwork, connect, switchToArc, getUsdcBalance, disconnect };
}
