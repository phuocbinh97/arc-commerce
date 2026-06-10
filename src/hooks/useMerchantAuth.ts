"use client";
import { useState, useEffect, useCallback } from "react";

export interface MerchantSession {
  merchantId: string;
  name: string;
  wallet: string;
}

const SESSION_KEY = "arcMerchantSession";

export function useMerchantAuth() {
  const [session, setSession] = useState<MerchantSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) setSession(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const login = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth) { setError("MetaMask not found"); return; }

    setLoading(true); setError("");
    try {
      const accounts = await eth.request({ method: "eth_requestAccounts" });
      const wallet = accounts[0] as string;
      const message = `ArcCommerce:login:${wallet.toLowerCase()}`;

      const signature = await eth.request({
        method: "personal_sign",
        params: [message, wallet],
      });

      const res = await fetch("/api/merchants/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, signature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const s: MerchantSession = { merchantId: data.merchant.merchantId, name: data.merchant.name, wallet };
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      setSession(s);
    } catch (e: any) {
      setError(e.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  return { session, login, logout, loading, error };
}
