"use client";
import { useCallback, useState } from "react";
import {
  encodeApprove, encodeHubPay, encodeMemoCallData, buildMemoContent,
  waitForReceipt, parseUsdcErc20, USDC_ADDRESS, HUB_CONTRACT, MERCHANT_WALLET, MEMO_CONTRACT, KIT_KEY
} from "@/lib/arc";
import { savePayment, getSettings } from "@/lib/storage";

export type CheckoutStep =
  | "idle"
  | "swapping"
  | "approving"
  | "confirming-approve"
  | "paying"
  | "confirming-pay"
  | "bridging"
  | "waiting-bridge"
  | "switching-network"
  | "success"
  | "error";

export function useCheckout() {
  const [step, setStep] = useState<CheckoutStep>("idle");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");

  const pay = useCallback(async ({
    amount, orderId, memo, payerName, merchantOverride, payToken = "USDC", provider,
  }: {
    amount: string;
    orderId: string;
    memo: string;
    payerName?: string;
    merchantOverride?: { wallet: string; merchantId: string };
    payToken?: "USDC" | "EURC";
    provider?: any;
  }) => {
    const eth = provider || (window as any).ethereum;
    if (!eth) throw new Error("No wallet found.");

    const settings = getSettings();
    const merchant = merchantOverride?.wallet || settings.merchantWallet || MERCHANT_WALLET;
    const contract = settings.hubContract || HUB_CONTRACT;
    const merchantId = merchantOverride?.merchantId || settings.merchantId || "arc-commerce";

    setStep("swapping"); setError(""); setTxHash("");

    try {
      // Guard: if orderId is an invoice, check it hasn't been paid already
      if (orderId.startsWith("INV-")) {
        const checkRes = await fetch(`/api/invoices/status?invoiceId=${orderId}`).catch(() => null);
        if (checkRes?.ok) {
          const { status } = await checkRes.json();
          if (status === "paid") {
            setError("This invoice has already been paid.");
            setStep("error");
            return;
          }
          if (status === "void" || status === "expired") {
            setError(`This invoice is ${status} and can no longer be paid.`);
            setStep("error");
            return;
          }
        }
      }

      const accs = await eth.request({ method: "eth_accounts" });
      const account = accs[0];

      // Step 0: Swap EURC → USDC if needed
      if (payToken === "EURC") {
        const appKitModule = await import("@circle-fin/app-kit");
        const adapterModule = await import("@circle-fin/adapter-viem-v2");
        const AppKit = (appKitModule as any).AppKit;
        const createAdapterFromProvider = (adapterModule as any).createAdapterFromProvider;

        const kit = new AppKit();
        const adapter = await createAdapterFromProvider({ provider: eth });

        // Swap 1% more to cover slippage
        const swapAmount = (parseFloat(amount) * 1.01).toFixed(2);

        const nonceBefore = await eth.request({ method: "eth_getTransactionCount", params: [account, "latest"] })
          .then((n: string) => parseInt(n, 16));

        await kit.swap({
          from: { adapter, chain: "Arc_Testnet" },
          tokenIn: "EURC",
          tokenOut: "USDC",
          amountIn: swapAmount,
          config: { kitKey: `KIT_KEY:${KIT_KEY}` },
        });

        const nonceAfter = await eth.request({ method: "eth_getTransactionCount", params: [account, "latest"] })
          .then((n: string) => parseInt(n, 16));

        if (nonceAfter <= nonceBefore) {
          setError("Swap cancelled.");
          setStep("error");
          return;
        }
      }

      const units = parseUsdcErc20(amount);

      // Step 1: Approve USDC — no gas pricing, let MetaMask handle it; only set gas limit
      setStep("approving");
      const approveTx = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: account, to: USDC_ADDRESS, value: "0x0", data: encodeApprove(contract, units), gas: "0x186a0" }],
      });

      setStep("confirming-approve");
      await waitForReceipt(eth, approveTx);

      // Step 2: Pay — wrapped in Arc Memo contract for on-chain structured context
      setStep("paying");
      const hubData    = encodeHubPay(merchant, merchantId, orderId, units, memo);
      const memoContent = buildMemoContent({ orderId, merchantId, payerName });
      const memoData   = encodeMemoCallData(contract as `0x${string}`, hubData, orderId, memoContent);
      const payTx = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: account, to: MEMO_CONTRACT, value: "0x0", data: memoData, gas: "0x7A120" }],
      });

      setStep("confirming-pay");
      await waitForReceipt(eth, payTx);

      savePayment({ txHash: payTx, amount, orderId, merchant: account, ts: Date.now(), payerName });
      fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: payTx, amount, orderId, merchantId, merchantWallet: merchant, buyerWallet: account, ts: Date.now() }),
      }).catch(console.error);

      if (orderId.startsWith("INV-")) {
        fetch("/api/invoices", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId: orderId, txHash: payTx }),
        }).catch(console.error);
      }

      setTxHash(payTx);
      setStep("success");
      return payTx;
    } catch (e: any) {
      setError(e.message || "Payment failed.");
      setStep("error");
      throw e;
    }
  }, []);

  // Bridge USDC from another chain to Arc, then pay merchant
  const bridgeAndPay = useCallback(async ({
    amount, orderId, memo, payerName, merchantOverride, sourceChainKey, provider,
  }: {
    amount: string;
    orderId: string;
    memo: string;
    payerName?: string;
    merchantOverride?: { wallet: string; merchantId: string };
    sourceChainKey: string; // Circle App Kit chain name e.g. "Base_Sepolia"
    provider: any;
  }) => {
    const eth = provider || (window as any).ethereum;
    if (!eth) throw new Error("No wallet found.");

    setStep("bridging"); setError(""); setTxHash("");

    try {
      const accs = await eth.request({ method: "eth_accounts" });
      const account = accs[0];

      // Step 1: Bridge from source chain → Arc using Circle App Kit
      const appKitModule = await import("@circle-fin/app-kit");
      const adapterModule = await import("@circle-fin/adapter-viem-v2");
      const AppKit = (appKitModule as any).AppKit;
      const createAdapterFromProvider = (adapterModule as any).createAdapterFromProvider;

      const kit = new AppKit();
      const adapter = await createAdapterFromProvider({ provider: eth });

      setStep("bridging");
      await kit.bridge({
        from: { adapter, chain: sourceChainKey },
        to: { chain: "Arc_Testnet" },
        amount,
        token: "USDC",
      });

      // Step 2: Wait for bridge finality (~20-30s)
      setStep("waiting-bridge");
      await new Promise(res => setTimeout(res, 25000));

      // Step 3: Switch wallet to Arc Testnet
      setStep("switching-network");
      const ARC_CHAIN_ID = "0x4CEF52";
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_CHAIN_ID }] });
      } catch (switchErr: any) {
        if (switchErr.code === 4902) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [{ chainId: ARC_CHAIN_ID, chainName: "Arc Testnet", rpcUrls: ["https://rpc.testnet.arc.network"], nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, blockExplorerUrls: ["https://testnet.arcscan.app"] }],
          });
        }
      }

      // Wait a moment for network switch to propagate
      await new Promise(res => setTimeout(res, 2000));

      // Step 4: Normal Arc payment
      const settings = getSettings();
      const merchant = merchantOverride?.wallet || settings.merchantWallet || MERCHANT_WALLET;
      const contract = settings.hubContract || HUB_CONTRACT;
      const merchantId = merchantOverride?.merchantId || settings.merchantId || "arc-commerce";

      const units = parseUsdcErc20(amount);

      setStep("approving");
      const approveTx = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: account, to: USDC_ADDRESS, value: "0x0", data: encodeApprove(contract, units), gas: "0x186a0" }],
      });
      setStep("confirming-approve");
      await waitForReceipt(eth, approveTx);

      setStep("paying");
      const hubData = encodeHubPay(merchant, merchantId, orderId, units, memo);
      const memoContent = buildMemoContent({ orderId, merchantId, payerName });
      const memoData = encodeMemoCallData(contract as `0x${string}`, hubData, orderId, memoContent);
      const payTx = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: account, to: MEMO_CONTRACT, value: "0x0", data: memoData, gas: "0x7A120" }],
      });

      setStep("confirming-pay");
      await waitForReceipt(eth, payTx);

      savePayment({ txHash: payTx, amount, orderId, merchant: account, ts: Date.now(), payerName });
      fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: payTx, amount, orderId, merchantId, merchantWallet: merchant, buyerWallet: account, ts: Date.now() }),
      }).catch(console.error);

      if (orderId.startsWith("INV-")) {
        fetch("/api/invoices", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId: orderId, txHash: payTx }),
        }).catch(console.error);
      }

      setTxHash(payTx);
      setStep("success");
      return payTx;
    } catch (e: any) {
      setError(e.message || "Bridge & Pay failed.");
      setStep("error");
      throw e;
    }
  }, []);

  const reset = useCallback(() => {
    setStep("idle"); setTxHash(""); setError("");
  }, []);

  return { step, txHash, error, pay, bridgeAndPay, reset };
}
