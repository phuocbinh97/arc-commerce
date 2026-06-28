// Storage helpers — localStorage as cache, Vercel KV as source of truth.
// Every save() awaits KV write. On wallet connect, call syncFromServer(wallet)
// to pull KV into localStorage so reads are instant.

const ALL_KEYS = [
  "arcCheckoutHistory", "arcCommerceInvoices", "arcCommerceSettings",
  "arcBridgeHistory", "arcSwapHistory", "arcRecurringPayments",
  "arcRecurringInvoices", "arcMerchantSession", "arcPeopleContacts",
  "arcPayrollSessions", "arcContactPayments",
];

function isBrowser() { return typeof window !== "undefined"; }

function getWallet(): string {
  try {
    return (
      JSON.parse(localStorage.getItem("arcMerchantSession") || "{}").wallet ||
      localStorage.getItem("arcExpectedAddress") ||
      ""
    );
  } catch { return ""; }
}

function lsGet<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
  catch { return fallback; }
}

function lsSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

/** Write one key to KV — awaited, guaranteed before caller returns. */
async function kvWrite(wallet: string, key: string, value: unknown) {
  if (!wallet || !isBrowser()) return;
  try {
    await fetch("/api/user-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: wallet.toLowerCase(), [key]: value }),
    });
  } catch { /* network down — data still in localStorage */ }
}

/** Pull all KV data into localStorage. Call once after wallet connects. */
export async function syncFromServer(wallet: string): Promise<void> {
  if (!wallet || !isBrowser()) return;
  try {
    const res = await fetch(`/api/user-data?wallet=${wallet.toLowerCase()}`);
    if (!res.ok) return;
    const data: Record<string, unknown> = await res.json();
    for (const key of ALL_KEYS) {
      if (data[key] !== undefined) lsSet(key, data[key]);
    }
  } catch { /* offline — keep localStorage */ }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PaymentHistory {
  txHash: string; amount: string; orderId: string;
  merchant: string; ts: number; payerName?: string;
}
export interface Invoice {
  id: string; amount: string; description: string; memo: string;
  clientName?: string; status: "pending" | "paid" | "expired" | "void";
  createdAt: number; expiresAt: number | null;
  deleted?: boolean; deletedAt?: number;
}
export interface MerchantSettings {
  businessName: string; merchantId: string; merchantWallet: string;
  hubContract: string; siteUrl?: string; savedAt?: number;
}
export interface SwapEntry {
  tokenIn: string; tokenOut: string; amountIn: string;
  ts: number; status: "completed" | "failed";
}
export interface BridgeEntry {
  txHash?: string; amount: string; token?: string;
  from?: string; to?: string; fromChain?: string; toChain?: string;
  ts: number; status?: string; txId?: string;
}
export interface RecurringPayment {
  id: string; name: string;
  category: "hosting" | "domain" | "marketing" | "salary" | "tools" | "other";
  recipientWallet: string; amount: string;
  interval: "test" | "weekly" | "monthly" | "quarterly" | "yearly";
  payDay?: number; payWeekday?: number; totalPeriods?: number;
  paidPeriods: number; startDate: number; nextDueDate: number;
  status: "active" | "paused" | "cancelled" | "completed"; notes?: string;
}
export interface RecurringInvoice {
  id: string; recurringId: string; name: string;
  recipientWallet: string; amount: string; txHash: string; paidAt: number;
}
export interface Contact {
  id: string; name: string; wallet: string;
  category: "employee" | "vendor" | "partner" | "other";
  customCategory?: string; notes?: string; createdAt: number;
}
export interface PayrollEntry {
  contactId: string; name: string; wallet: string; amount: string;
  paid: boolean; txHash?: string; paidAt?: number;
}
export interface PayrollSession {
  id: string; title: string; description?: string;
  entries: PayrollEntry[]; createdAt: number; paidAt?: number;
  txHash?: string; status: "draft" | "partial" | "paid";
}
export interface ContactPaymentRecord {
  txHash: string; amount: string; paidAt: number;
  sessionId: string; sessionTitle: string; contactWallet: string;
}

// ── Reads (from localStorage cache) ──────────────────────────────────────────

export function getPaymentHistory(): PaymentHistory[] {
  if (!isBrowser()) return [];
  return lsGet<PaymentHistory[]>("arcCheckoutHistory", []);
}
export function getInvoices(): Invoice[] {
  if (!isBrowser()) return [];
  return lsGet<Invoice[]>("arcCommerceInvoices", []);
}
export function getSettings(): MerchantSettings {
  if (!isBrowser()) return { businessName:"", merchantId:"", merchantWallet:"", hubContract:"" };
  return lsGet<MerchantSettings>("arcCommerceSettings", { businessName:"", merchantId:"", merchantWallet:"", hubContract:"" });
}
export function getSwapHistory(): SwapEntry[] {
  if (!isBrowser()) return [];
  return lsGet<SwapEntry[]>("arcSwapHistory", []);
}
export function getBridgeHistory(): BridgeEntry[] {
  if (!isBrowser()) return [];
  return lsGet<BridgeEntry[]>("arcBridgeHistory", []);
}
export function getRecurringPayments(): RecurringPayment[] {
  if (!isBrowser()) return [];
  return lsGet<RecurringPayment[]>("arcRecurringPayments", []);
}
export function getRecurringInvoices(): RecurringInvoice[] {
  if (!isBrowser()) return [];
  return lsGet<RecurringInvoice[]>("arcRecurringInvoices", []);
}
export function getContacts(): Contact[] {
  if (!isBrowser()) return [];
  return lsGet<Contact[]>("arcPeopleContacts", []);
}
export function getPayrollSessions(): PayrollSession[] {
  if (!isBrowser()) return [];
  return lsGet<PayrollSession[]>("arcPayrollSessions", []);
}
export function getContactPayments(wallet: string): ContactPaymentRecord[] {
  if (!isBrowser()) return [];
  const all = lsGet<ContactPaymentRecord[]>("arcContactPayments", []);
  return all.filter(r => r.contactWallet.toLowerCase() === wallet.toLowerCase());
}

// ── Writes (localStorage + await KV) ─────────────────────────────────────────

export async function savePayment(entry: PaymentHistory) {
  if (!isBrowser()) return;
  const hist = [entry, ...getPaymentHistory()].slice(0, 50);
  lsSet("arcCheckoutHistory", hist);
  await kvWrite(getWallet(), "arcCheckoutHistory", hist);
}
export async function saveInvoices(invs: Invoice[]) {
  if (!isBrowser()) return;
  lsSet("arcCommerceInvoices", invs);
  await kvWrite(getWallet(), "arcCommerceInvoices", invs);
}
export async function saveSettings(s: MerchantSettings) {
  if (!isBrowser()) return;
  const val = { ...s, savedAt: Date.now() };
  lsSet("arcCommerceSettings", val);
  if (s.hubContract) localStorage.setItem("arcCheckoutHub", s.hubContract);
  if (s.merchantWallet) localStorage.setItem("arcCheckoutMerchant", s.merchantWallet);
  await kvWrite(getWallet(), "arcCommerceSettings", val);
}
export async function saveSwapEntry(entry: SwapEntry) {
  if (!isBrowser()) return;
  const hist = [entry, ...getSwapHistory()].slice(0, 20);
  lsSet("arcSwapHistory", hist);
  await kvWrite(getWallet(), "arcSwapHistory", hist);
}
export async function saveBridgeEntry(entry: BridgeEntry) {
  if (!isBrowser()) return;
  const hist = [entry, ...getBridgeHistory()].slice(0, 20);
  lsSet("arcBridgeHistory", hist);
  await kvWrite(getWallet(), "arcBridgeHistory", hist);
}
export async function saveRecurringPayments(list: RecurringPayment[]) {
  if (!isBrowser()) return;
  lsSet("arcRecurringPayments", list);
  await kvWrite(getWallet(), "arcRecurringPayments", list);
}
export async function saveRecurringInvoice(inv: RecurringInvoice) {
  if (!isBrowser()) return;
  const list = [inv, ...getRecurringInvoices()].slice(0, 200);
  lsSet("arcRecurringInvoices", list);
  await kvWrite(getWallet(), "arcRecurringInvoices", list);
}
export async function saveContacts(list: Contact[]) {
  if (!isBrowser()) return;
  lsSet("arcPeopleContacts", list);
  await kvWrite(getWallet(), "arcPeopleContacts", list);
}
export async function savePayrollSessions(list: PayrollSession[]) {
  if (!isBrowser()) return;
  lsSet("arcPayrollSessions", list);
  await kvWrite(getWallet(), "arcPayrollSessions", list);
}
export async function saveContactPayments(records: ContactPaymentRecord[]) {
  if (!isBrowser()) return;
  const existing = lsGet<ContactPaymentRecord[]>("arcContactPayments", []);
  const newHashes = new Set(records.map(r => r.txHash + r.contactWallet));
  const merged = [...records, ...existing.filter(r => !newHashes.has(r.txHash + r.contactWallet))].slice(0, 500);
  lsSet("arcContactPayments", merged);
  await kvWrite(getWallet(), "arcContactPayments", merged);
}
