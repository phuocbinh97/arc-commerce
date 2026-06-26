// localStorage helpers — type-safe wrappers
// KV sync: on wallet connect call syncFromServer(wallet), all saves auto-sync to KV

const LS_KEYS = [
  "arcCheckoutHistory","arcCommerceInvoices","arcCommerceSettings",
  "arcBridgeHistory","arcRecurringPayments","arcRecurringInvoices","arcMerchantSession","arcPeopleContacts","arcPayrollSessions",
];

/** Load all data from KV into localStorage. Call after wallet connects. */
export async function syncFromServer(wallet: string): Promise<void> {
  if (!wallet) return;
  try {
    const res = await fetch(`/api/user-data?wallet=${wallet.toLowerCase()}`);
    if (!res.ok) return;
    const data: Record<string, unknown> = await res.json();
    for (const key of LS_KEYS) {
      if (data[key] !== undefined) {
        localStorage.setItem(key, JSON.stringify(data[key]));
      }
    }
  } catch { /* offline — keep localStorage */ }
}

/** Sync one key to KV. Called automatically by each save* function. */
async function syncKey(wallet: string, key: string, value: unknown) {
  if (!wallet) return;
  try {
    fetch("/api/user-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: wallet.toLowerCase(), [key]: value }),
    });
  } catch { /* ignore — localStorage is already saved */ }
}

function getWallet(): string {
  try {
    return (
      JSON.parse(localStorage.getItem("arcMerchantSession") || "{}").wallet ||
      localStorage.getItem("arcExpectedAddress") ||
      ""
    );
  } catch { return ""; }
}

export interface PaymentHistory {
  txHash: string;
  amount: string;
  orderId: string;
  merchant: string;
  ts: number;
  payerName?: string;
}

export interface Invoice {
  id: string;
  amount: string;
  description: string;
  memo: string;
  clientName?: string;
  status: "pending" | "paid" | "expired" | "void";
  createdAt: number;
  expiresAt: number | null;
}

export interface MerchantSettings {
  businessName: string;
  merchantId: string;
  merchantWallet: string;
  hubContract: string;
  siteUrl?: string;
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
  const val = hist.slice(0, 50);
  localStorage.setItem("arcCheckoutHistory", JSON.stringify(val));
  syncKey(getWallet(), "arcCheckoutHistory", val);
}

export function getInvoices(): Invoice[] {
  if (!isBrowser()) return [];
  try { return JSON.parse(localStorage.getItem("arcCommerceInvoices") || "[]"); } catch { return []; }
}
export function saveInvoices(invs: Invoice[]) {
  if (!isBrowser()) return;
  localStorage.setItem("arcCommerceInvoices", JSON.stringify(invs));
  syncKey(getWallet(), "arcCommerceInvoices", invs);
}

export function getSettings(): MerchantSettings {
  if (!isBrowser()) return { businessName: "", merchantId: "", merchantWallet: "", hubContract: "" };
  try {
    return JSON.parse(localStorage.getItem("arcCommerceSettings") || "{}");
  } catch { return { businessName: "", merchantId: "", merchantWallet: "", hubContract: "" }; }
}
export function saveSettings(s: MerchantSettings) {
  if (!isBrowser()) return;
  const val = { ...s, savedAt: Date.now() };
  localStorage.setItem("arcCommerceSettings", JSON.stringify(val));
  if (s.hubContract) localStorage.setItem("arcCheckoutHub", s.hubContract);
  if (s.merchantWallet) localStorage.setItem("arcCheckoutMerchant", s.merchantWallet);
  syncKey(getWallet(), "arcCommerceSettings", val);
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
  try {
    return (
      JSON.parse(localStorage.getItem("arcMerchantSession") || "{}").wallet ||
      localStorage.getItem("arcExpectedAddress") ||
      ""
    );
  } catch { return ""; }
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
  const val = hist.slice(0, 20);
  localStorage.setItem(key, JSON.stringify(val));
  syncKey(getWallet(), "arcBridgeHistory", val);
}

export interface RecurringPayment {
  id: string;
  name: string;
  category: "hosting" | "domain" | "marketing" | "salary" | "tools" | "other";
  recipientWallet: string;
  amount: string;
  interval: "test" | "weekly" | "monthly" | "quarterly" | "yearly";
  payDay?: number;       // 1-28, day of month for monthly/quarterly/yearly
  payWeekday?: number;   // 1-7 (Mon-Sun) for weekly
  totalPeriods?: number; // undefined = unlimited
  paidPeriods: number;
  startDate: number;
  nextDueDate: number;
  status: "active" | "paused" | "cancelled" | "completed";
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
  syncKey(getWallet(), "arcRecurringPayments", list);
}
export function getRecurringInvoices(): RecurringInvoice[] {
  if (!isBrowser()) return [];
  try { return JSON.parse(localStorage.getItem("arcRecurringInvoices") || "[]"); } catch { return []; }
}
export interface Contact {
  id: string;
  name: string;
  wallet: string;
  category: "employee" | "vendor" | "partner" | "other";
  notes?: string;
  createdAt: number;
}

export function getContacts(): Contact[] {
  if (!isBrowser()) return [];
  try { return JSON.parse(localStorage.getItem("arcPeopleContacts") || "[]"); } catch { return []; }
}
export interface PayrollEntry {
  contactId: string;
  name: string;
  wallet: string;
  amount: string;
  paid: boolean;
  txHash?: string;
  paidAt?: number;
}

export interface PayrollSession {
  id: string;
  title: string;           // "Lương tháng 6/2026"
  description?: string;
  entries: PayrollEntry[];
  createdAt: number;
  paidAt?: number;         // when fully paid
  txHash?: string;         // multicall tx
  status: "draft" | "partial" | "paid";
}

export function getPayrollSessions(): PayrollSession[] {
  if (!isBrowser()) return [];
  try { return JSON.parse(localStorage.getItem("arcPayrollSessions") || "[]"); } catch { return []; }
}
export function savePayrollSessions(list: PayrollSession[]) {
  if (!isBrowser()) return;
  localStorage.setItem("arcPayrollSessions", JSON.stringify(list));
  syncKey(getWallet(), "arcPayrollSessions", list);
}

export function saveContacts(list: Contact[]) {
  if (!isBrowser()) return;
  localStorage.setItem("arcPeopleContacts", JSON.stringify(list));
  syncKey(getWallet(), "arcPeopleContacts", list);
}

export function saveRecurringInvoice(inv: RecurringInvoice) {
  if (!isBrowser()) return;
  const list = getRecurringInvoices();
  list.unshift(inv);
  const val = list.slice(0, 200);
  localStorage.setItem("arcRecurringInvoices", JSON.stringify(val));
  syncKey(getWallet(), "arcRecurringInvoices", val);
}
