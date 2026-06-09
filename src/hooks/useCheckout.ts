"use client";
import { useCallback, useState } from "react";
import {
  encodeApprove, encodeHubPay, fetchGasPrice,
  waitForReceipt, parseUsdcErc20, USDC_ADDRESS, HUB_CONTRACT, MERCHANT_WALLET
} from "@/lib/arc";
import { savePayment } from "@/lib/storage";
import { getSettings } from "@/lib/storage";

export type CheckoutStep = "idle" | "approving" | "confirming-approve" | "paying" | "confirming-pay" | "success" | "error";

export function useCheckout() {
  const [step, setStep] = useState<CheckoutStep>("idle");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");

  const pay = useCallback(async ({
    amount, orderId, memo,
  }: { amount: string; orderId: string; memo: string }) => {
    const eth = (window as any).ethereum;
    if (!eth) throw new Error("No wallet found.");

    const settings = getSettings();
    const merchant = settings.merchantWallet || MERCHANT_WALLET;
    const contract = settings.hubContract || HUB_CONTRACT;
    const merchantId = settings.merchantId || "arc-commerce";

    setStep("approving"); setError(""); setTxHash("");

    try {
      const accs = await eth.request({ method: "eth_accounts" });
      const account = accs[0];
      const units = parseUsdcErc20(amount);
      const gas = await fetchGasPrice(eth);

      // Step 1: Approve
      const approveTx = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: account, to: USDC_ADDRESS, value: "0x0", data: encodeApprove(contract, units), ...gas }],
      });

      setStep("confirming-approve");
      await waitForReceipt(eth, approveTx);

      // Step 2: Pay
      setStep("paying");
      const gas2 = await fetchGasPrice(eth);
      const payTx = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: account, to: contract, value: "0x0",
          data: encodeHubPay(merchant, merchantId, orderId, units, memo), ...gas2 }],
      });

      setStep("confirming-pay");
      await waitForReceipt(eth, payTx);

      // Save to history
      savePayment({ txHash: payTx, amount, orderId, merchant, ts: Date.now() });

      setTxHash(payTx);
      setStep("success");
      return payTx;
    } catch (e: any) {
      setError(e.message || "Payment failed.");
      setStep("error");
      throw e;
    }
  }, []);

  const reset = useCallback(() => {
    setStep("idle"); setTxHash(""); setError("");
  }, []);

  return { step, txHash, error, pay, reset };
}
