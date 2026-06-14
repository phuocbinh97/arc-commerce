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

export interface SwapEntry {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  ts: number;
  status: "completed" | "failed";
}

function swapKey(addr?: string) { return addr ? `arcSwapHistory:${addr.toLowerCase()}` : "arcSwapHistory"; }
function bridgeKey(addr?: string) { return addr ? `arcBridgeHistory:${addr.toLowerCase()}` : "arcBridgeHistory"; }

function currentAddr() {
  try { return JSON.parse(localStorage.getItem("arcMerchantSession") || "{}").wallet || ""; } catch { return ""; }
}

export function getSwapHistory(addr?: string): SwapEntry[] {
  if (!isBrowser()) return [];
  const key = swapKey(addr || currentAddr());
  try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
}
export function saveSwapEntry(entry: SwapEntry, addr?: string) {
  if (!isBrowser()) return;
  const key = swapKey(addr || currentAddr());
  const hist = getSwapHistory(addr);
  hist.unshift(entry);
  localStorage.setItem(key, JSON.stringify(hist.slice(0, 20)));
}

export function getBridgeHistory(addr?: string) {
  if (!isBrowser()) return [];
  const key = bridgeKey(addr || currentAddr());
  try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
}
export function saveBridgeEntry(entry: any, addr?: string) {
  if (!isBrowser()) return;
  const key = bridgeKey(addr || currentAddr());
  const hist = getBridgeHistory(addr);
  hist.unshift(entry);
  localStorage.setItem(key, JSON.stringify(hist.slice(0, 20)));
}

export interface RecurringPayment {
  id: string;
  name: string;
  category: "hosting" | "domain" | "marketing" | "salary" | "tools" | "other";
  recipientWallet: string;
  amount: string;
  interval: "test" | "weekly" | "monthly" | "quarterly" | "yearly";
  payDay?: number; // 1-28, day of month for monthly/quarterly/yearly
  startDate: number;
  nextDueDate: number;
  status: "active" | "paused" | "cancelled";
  notes?: string;
}

export interface RecurringInvoice {
  id: string;
  recurringId: string;
  name: string;
  recipientWallet: string;
  amount: string;
  txHash: string;
  paidAt: number;
}

export function getRecurringPayments(): RecurringPayment[] {
  if (!isBrowser()) return [];
  try { return JSON.parse(localStorage.getItem("arcRecurringPayments") || "[]"); } catch { return []; }
}
export function saveRecurringPayments(list: RecurringPayment[]) {
  if (!isBrowser()) return;
  localStorage.setItem("arcRecurringPayments", JSON.stringify(list));
}
export function getRecurringInvoices(): RecurringInvoice[] {
  if (!isBrowser()) return [];
  try { return JSON.parse(localStorage.getItem("arcRecurringInvoices") || "[]"); } catch { return []; }
}
export function saveRecurringInvoice(inv: RecurringInvoice) {
  if (!isBrowser()) return;
  const list = getRecurringInvoices();
  list.unshift(inv);
  localStorage.setItem("arcRecurringInvoices", JSON.stringify(list.slice(0, 200)));
}
