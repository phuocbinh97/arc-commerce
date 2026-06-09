// localStorage helpers — type-safe wrappers

export interface PaymentHistory {
  txHash: string;
  amount: string;
  orderId: string;
  merchant: string;
  ts: number;
}

export interface Invoice {
  id: string;
  amount: string;
  description: string;
  memo: string;
  status: "pending" | "paid" | "expired";
  createdAt: number;
  expiresAt: number | null;
}

export interface MerchantSettings {
  businessName: string;
  merchantId: string;
  merchantWallet: string;
  hubContract: string;
  savedAt?: number;
}

function isBrowser() { return typeof window !== "undefined"; }

export function getPaymentHistory(): PaymentHistory[] {
  if (!isBrowser()) return [];
  try { return JSON.parse(localStorage.getItem("arcCheckoutHistory") || "[]"); } catch { return []; }
}
export function savePayment(entry: PaymentHistory) {
  if (!isBrowser()) return;
  const hist = getPaymentHistory();
  hist.unshift(entry);
  localStorage.setItem("arcCheckoutHistory", JSON.stringify(hist.slice(0, 50)));
}

export function getInvoices(): Invoice[] {
  if (!isBrowser()) return [];
  try { return JSON.parse(localStorage.getItem("arcCommerceInvoices") || "[]"); } catch { return []; }
}
export function saveInvoices(invs: Invoice[]) {
  if (!isBrowser()) return;
  localStorage.setItem("arcCommerceInvoices", JSON.stringify(invs));
}

export function getSettings(): MerchantSettings {
  if (!isBrowser()) return { businessName: "", merchantId: "", merchantWallet: "", hubContract: "" };
  try {
    return JSON.parse(localStorage.getItem("arcCommerceSettings") || "{}");
  } catch { return { businessName: "", merchantId: "", merchantWallet: "", hubContract: "" }; }
}
export function saveSettings(s: MerchantSettings) {
  if (!isBrowser()) return;
  localStorage.setItem("arcCommerceSettings", JSON.stringify({ ...s, savedAt: Date.now() }));
  if (s.hubContract) localStorage.setItem("arcCheckoutHub", s.hubContract);
  if (s.merchantWallet) localStorage.setItem("arcCheckoutMerchant", s.merchantWallet);
}

export function getBridgeHistory() {
  if (!isBrowser()) return [];
  try { return JSON.parse(localStorage.getItem("arcBridgeHistory") || "[]"); } catch { return []; }
}
export function saveBridgeEntry(entry: any) {
  if (!isBrowser()) return;
  const hist = getBridgeHistory();
  hist.unshift(entry);
  localStorage.setItem("arcBridgeHistory", JSON.stringify(hist.slice(0, 20)));
}
