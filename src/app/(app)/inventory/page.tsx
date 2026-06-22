"use client";

import { useState } from "react";
import { EntityIoControls } from "@/components/entity-io-controls";
import {
  Briefcase,
  Check,
  Coins,
  CreditCard,
  HelpCircle,
  Pencil,
  Receipt,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatCents, parseToCents } from "@/lib/money";
import { cn } from "@/lib/utils";

type AccountKind = "asset" | "liability";
type BillCadence = "weekly" | "monthly" | "yearly";

const ASSET_CATEGORIES = [
  "checking",
  "savings",
  "cash",
  "investment",
  "crypto",
  "property",
  "other",
];
const LIABILITY_CATEGORIES = [
  "credit_card",
  "loan",
  "mortgage",
  "student_loan",
  "other",
];
const BILL_CATEGORIES = [
  "rent",
  "utility",
  "subscription",
  "insurance",
  "transport",
  "other",
];

export default function InventoryPage() {
  const utils = trpc.useUtils();
  const { data: summary } = trpc.inventory.summary.useQuery();
  const { data: accounts, isLoading: aLoading } =
    trpc.inventory.accounts.list.useQuery();
  const { data: bills, isLoading: bLoading } =
    trpc.inventory.bills.list.useQuery();
  const { data: goals, isLoading: gLoading } =
    trpc.inventory.goals.list.useQuery();
  const { data: epics } = trpc.epic.list.useQuery();

  const invalidate = () => {
    utils.inventory.summary.invalidate();
    utils.inventory.accounts.list.invalidate();
    utils.inventory.bills.list.invalidate();
    utils.inventory.goals.list.invalidate();
  };

  const createAccount = trpc.inventory.accounts.create.useMutation({
    onSuccess: invalidate,
  });
  const updateAccount = trpc.inventory.accounts.update.useMutation({
    onSuccess: invalidate,
  });
  const archiveAccount = trpc.inventory.accounts.archive.useMutation({
    onSuccess: invalidate,
  });

  const createBill = trpc.inventory.bills.create.useMutation({
    onSuccess: invalidate,
  });
  const updateBill = trpc.inventory.bills.update.useMutation({
    onSuccess: invalidate,
  });
  const archiveBill = trpc.inventory.bills.archive.useMutation({
    onSuccess: invalidate,
  });

  const createGoal = trpc.inventory.goals.create.useMutation({
    onSuccess: invalidate,
  });
  const updateGoal = trpc.inventory.goals.update.useMutation({
    onSuccess: invalidate,
  });
  const archiveGoal = trpc.inventory.goals.archive.useMutation({
    onSuccess: invalidate,
  });

  const currency = "EUR"; // first cut: single currency

  const assets = (accounts ?? []).filter((a) => a.kind === "asset");
  const liabilities = (accounts ?? []).filter((a) => a.kind === "liability");

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-trails-accent" />
            Inventory
            <span
              title="Your wealth, liabilities, recurring bills, and savings goals — an RPG stat sheet for real-world finances. Click any balance to edit it inline. All amounts are stored in integer cents to avoid floating-point drift."
              className="text-trails-info"
            >
              <HelpCircle className="h-4 w-4" />
            </span>
          </h1>
          <p className="mt-1 text-sm text-trails-fg-dim">
            Click a balance to edit. Bills' monthly equivalent is normalized
            across cadences so you always see a single monthly burn rate.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EntityIoControls shape="account" label="Account" />
          <EntityIoControls shape="bill" label="Bill" />
          <EntityIoControls shape="goal" label="Goal" />
        </div>
      </header>

      {summary && <NetWorthCard summary={summary} currency={currency} />}

      <AccountsSection
        title="Assets"
        kind="asset"
        accent="emerald"
        Icon={Wallet}
        accounts={assets}
        loading={aLoading}
        categories={ASSET_CATEGORIES}
        currency={currency}
        onCreate={(input) => createAccount.mutate({ ...input, kind: "asset" })}
        onUpdate={(input) => updateAccount.mutate(input)}
        onArchive={(id) => {
          if (confirm("Archive this account?"))
            archiveAccount.mutate({ id });
        }}
      />

      <AccountsSection
        title="Liabilities"
        kind="liability"
        accent="rose"
        Icon={CreditCard}
        accounts={liabilities}
        loading={aLoading}
        categories={LIABILITY_CATEGORIES}
        currency={currency}
        onCreate={(input) =>
          createAccount.mutate({ ...input, kind: "liability" })
        }
        onUpdate={(input) => updateAccount.mutate(input)}
        onArchive={(id) => {
          if (confirm("Archive this account?"))
            archiveAccount.mutate({ id });
        }}
      />

      <BillsSection
        bills={bills ?? []}
        loading={bLoading}
        currency={currency}
        categories={BILL_CATEGORIES}
        monthlyOutflowCents={summary?.monthlyOutflowCents ?? 0}
        onCreate={(input) => createBill.mutate(input)}
        onUpdate={(input) => updateBill.mutate(input)}
        onArchive={(id) => {
          if (confirm("Archive this bill?")) archiveBill.mutate({ id });
        }}
      />

      <GoalsSection
        goals={goals ?? []}
        loading={gLoading}
        currency={currency}
        epics={epics ?? []}
        onCreate={(input) => createGoal.mutate(input)}
        onUpdate={(input) => updateGoal.mutate(input)}
        onArchive={(id) => {
          if (confirm("Abandon this goal?")) archiveGoal.mutate({ id });
        }}
      />
    </div>
  );
}

// ============================================================================
// Net Worth card
// ============================================================================

function NetWorthCard({
  summary,
  currency,
}: {
  summary: {
    assetsCents: number;
    liabilitiesCents: number;
    netWorthCents: number;
    monthlyOutflowCents: number;
    accountCount: number;
    billCount: number;
  };
  currency: string;
}) {
  const net = summary.netWorthCents;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
      <div className="rounded-lg border p-4 sm:col-span-2">
        <div className="flex items-center gap-2 font-display text-[11px] uppercase tracking-widest text-trails-accent">
          <Coins className="h-3.5 w-3.5" />
          Net Worth
        </div>
        <div
          className={cn(
            "mt-2 font-display text-4xl font-bold tracking-tight tabular-nums",
            net >= 0 ? "text-trails-good" : "text-trails-bad",
          )}
          title={
            net >= 0
              ? "Assets exceed liabilities"
              : "Liabilities exceed assets — net debt"
          }
        >
          {formatCents(net, currency)}
        </div>
        <p className="mt-1 text-xs text-trails-fg-dim">
          {summary.accountCount} account
          {summary.accountCount === 1 ? "" : "s"}
        </p>
      </div>
      <Stat
        label="Assets"
        value={formatCents(summary.assetsCents, currency)}
        Icon={TrendingUp}
        accent="emerald"
      />
      <Stat
        label="Liabilities"
        value={formatCents(summary.liabilitiesCents, currency)}
        Icon={TrendingDown}
        accent="rose"
      />
      <Stat
        label="Monthly outflow"
        value={formatCents(summary.monthlyOutflowCents, currency)}
        Icon={Receipt}
        accent="amber"
        sub={`${summary.billCount} bill${summary.billCount === 1 ? "" : "s"}`}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  Icon,
  accent,
  sub,
}: {
  label: string;
  value: string;
  Icon: typeof Coins;
  accent: "emerald" | "rose" | "amber" | "indigo";
  sub?: string;
}) {
  const colorMap: Record<typeof accent, string> = {
    emerald: "text-trails-good",
    rose: "text-trails-bad",
    amber: "text-trails-warn",
    indigo: "text-trails-info",
  };
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2 font-display text-[11px] uppercase tracking-widest text-trails-accent">
        <Icon className={cn("h-3.5 w-3.5", colorMap[accent])} />
        {label}
      </div>
      <div className={cn("mt-1 text-xl font-semibold tabular-nums", colorMap[accent])}>
        {value}
      </div>
      {sub && <p className="mt-0.5 text-[10px] text-trails-fg-dim">{sub}</p>}
    </div>
  );
}

// ============================================================================
// Accounts section (used for both assets + liabilities)
// ============================================================================

type AccountRow = {
  id: string;
  name: string;
  kind: AccountKind;
  category: string;
  balanceCents: number;
  currency: string;
  notes: string | null;
};

function AccountsSection({
  title,
  kind,
  accent,
  Icon,
  accounts,
  loading,
  categories,
  currency,
  onCreate,
  onUpdate,
  onArchive,
}: {
  title: string;
  kind: AccountKind;
  accent: "emerald" | "rose";
  Icon: typeof Wallet;
  accounts: AccountRow[];
  loading: boolean;
  categories: string[];
  currency: string;
  onCreate: (input: {
    name: string;
    category: string;
    balanceCents: number;
    currency: string;
  }) => void;
  onUpdate: (input: {
    id: string;
    name?: string;
    category?: string;
    balanceCents?: number;
    notes?: string | null;
  }) => void;
  onArchive: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(categories[0]);
  const [balance, setBalance] = useState("");

  const total = accounts.reduce((s, a) => s + a.balanceCents, 0);
  const ringClass =
    accent === "emerald"
      ? "border-l-emerald-500"
      : "border-l-rose-500";

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="!m-0 !border-0 !p-0 flex items-center gap-2 font-display text-sm uppercase tracking-widest text-trails-accent">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </h2>
        {accounts.length > 0 && (
          <span className="text-xs tabular-nums text-zinc-500">
            Total: <span className="font-semibold">{formatCents(total, currency)}</span>
          </span>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !balance.trim()) return;
          onCreate({
            name: name.trim(),
            category,
            balanceCents: parseToCents(balance),
            currency,
          });
          setName("");
          setBalance("");
        }}
        className="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-zinc-200 bg-white p-3 sm:grid-cols-[1fr_160px_140px_auto] dark:border-zinc-800 dark:bg-zinc-900"
      >
        <input
          type="text"
          placeholder={kind === "asset" ? "Account name" : "Liability name"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <input
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-right text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
        />
        <button
          type="submit"
          disabled={!name.trim() || !balance.trim()}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Add
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {kind === "asset"
            ? "No assets tracked yet."
            : "No liabilities tracked yet."}
        </p>
      ) : (
        <ul className="divide-y divide-trails-trim/20 rounded-lg border">
          {accounts.map((a) => (
            <AccountRowEditor
              key={a.id}
              account={a}
              ringClass={ringClass}
              categories={categories}
              onUpdate={onUpdate}
              onArchive={() => onArchive(a.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function AccountRowEditor({
  account,
  ringClass,
  categories,
  onUpdate,
  onArchive,
}: {
  account: AccountRow;
  ringClass: string;
  categories: string[];
  onUpdate: (input: {
    id: string;
    name?: string;
    category?: string;
    balanceCents?: number;
    notes?: string | null;
  }) => void;
  onArchive: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(
    (account.balanceCents / 100).toFixed(2),
  );

  // Pencil drawer state — name + category + notes.
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(account.name);
  const [category, setCategory] = useState(account.category);
  const [notes, setNotes] = useState(account.notes ?? "");

  function save() {
    const cents = parseToCents(draft);
    if (cents !== account.balanceCents) {
      onUpdate({ id: account.id, balanceCents: cents });
    }
    setEditing(false);
  }

  function saveOthers() {
    const newNotes = notes.trim();
    onUpdate({
      id: account.id,
      name: name.trim() !== account.name ? name.trim() : undefined,
      category: category !== account.category ? category : undefined,
      notes:
        newNotes !== (account.notes ?? "")
          ? newNotes || null
          : undefined,
    });
    setExpanded(false);
  }

  return (
    <li
      className={cn(
        "border-l-4 px-4 py-3",
        ringClass,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-trails-fg">
              {account.name}
            </span>
            <span className="rounded-full border border-trails-trim/40 bg-trails-bg-deep/60 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider text-trails-accent">
              {account.category.replace(/_/g, " ")}
            </span>
          </div>
          {account.notes && (
            <p className="mt-0.5 truncate text-[11px] text-trails-fg-dim">
              {account.notes}
            </p>
          )}
        </div>
        {editing ? (
          <input
            type="text"
            inputMode="decimal"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-32 rounded-md px-2 py-1 text-right text-sm tabular-nums"
          />
        ) : (
          <button
            onClick={() => {
              setDraft((account.balanceCents / 100).toFixed(2));
              setEditing(true);
            }}
            className="rounded px-2 py-1 text-right text-sm font-semibold tabular-nums hover:bg-trails-bg-glow"
            title="Click to update the balance (use after a deposit / withdrawal)"
          >
            {formatCents(account.balanceCents, account.currency)}
          </button>
        )}
        <button
          onClick={() => setExpanded((v) => !v)}
          title={
            expanded
              ? "Close edit panel"
              : "Edit name / category / notes"
          }
          className="rounded-md border p-1.5 text-trails-fg-dim hover:text-trails-accent"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onArchive}
          title="Archive this account"
          className="rounded-md border p-1.5 text-trails-fg-dim hover:text-trails-bad"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="mt-3 grid grid-cols-1 gap-2 border-t border-trails-trim/30 pt-3 sm:grid-cols-[1fr_160px_2fr_auto_auto]">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="rounded-md px-2 py-1 text-sm"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md px-2 py-1 text-sm"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="rounded-md px-2 py-1 text-sm"
          />
          <button
            onClick={saveOthers}
            disabled={!name.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
          >
            <Check className="h-3 w-3" /> Save
          </button>
          <button
            onClick={() => setExpanded(false)}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs"
          >
            <X className="h-3 w-3" /> Cancel
          </button>
        </div>
      )}
    </li>
  );
}

// ============================================================================
// Bills section
// ============================================================================

type BillRow = {
  id: string;
  name: string;
  amountCents: number;
  currency: string;
  cadence: BillCadence;
  category: string;
  nextDueDate: string | null;
};

function BillsSection({
  bills,
  loading,
  currency,
  categories,
  monthlyOutflowCents,
  onCreate,
  onUpdate,
  onArchive,
}: {
  bills: BillRow[];
  loading: boolean;
  currency: string;
  categories: string[];
  monthlyOutflowCents: number;
  onCreate: (input: {
    name: string;
    amountCents: number;
    cadence: BillCadence;
    category: string;
    currency: string;
    nextDueDate?: string;
  }) => void;
  onUpdate: (input: {
    id: string;
    name?: string;
    amountCents?: number;
    cadence?: BillCadence;
    category?: string;
    nextDueDate?: string | null;
  }) => void;
  onArchive: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<BillCadence>("monthly");
  const [category, setCategory] = useState(categories[0]);
  const [dueDate, setDueDate] = useState("");

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="!m-0 !border-0 !p-0 flex items-center gap-2 font-display text-sm uppercase tracking-widest text-trails-accent">
          <Receipt className="h-3.5 w-3.5" />
          Recurring Bills
        </h2>
        {bills.length > 0 && (
          <span className="text-xs tabular-nums text-zinc-500">
            Monthly equivalent:{" "}
            <span className="font-semibold">
              {formatCents(monthlyOutflowCents, currency)}
            </span>
          </span>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !amount.trim()) return;
          onCreate({
            name: name.trim(),
            amountCents: parseToCents(amount),
            cadence,
            category,
            currency,
            nextDueDate: dueDate || undefined,
          });
          setName("");
          setAmount("");
          setDueDate("");
        }}
        className="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-zinc-200 bg-white p-3 sm:grid-cols-[1fr_120px_140px_140px_140px_auto] dark:border-zinc-800 dark:bg-zinc-900"
      >
        <input
          type="text"
          placeholder="Bill name (e.g. Spotify)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <input
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-right text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
        />
        <select
          value={cadence}
          onChange={(e) => setCadence(e.target.value as BillCadence)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          title="Next due date (optional)"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <button
          type="submit"
          disabled={!name.trim() || !amount.trim()}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Add
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : bills.length === 0 ? (
        <p className="text-sm text-zinc-500">No recurring bills yet.</p>
      ) : (
        <ul className="divide-y divide-trails-trim/20 rounded-lg border">
          {bills.map((b) => (
            <BillRowEditor
              key={b.id}
              bill={b}
              categories={categories}
              onUpdate={onUpdate}
              onArchive={() => onArchive(b.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function BillRowEditor({
  bill,
  categories,
  onUpdate,
  onArchive,
}: {
  bill: BillRow;
  categories: string[];
  onUpdate: (input: {
    id: string;
    name?: string;
    amountCents?: number;
    cadence?: BillCadence;
    category?: string;
    nextDueDate?: string | null;
  }) => void;
  onArchive: () => void;
}) {
  // Inline editing happens in two layers:
  //   1. Click the amount → fast edit, mirrors AccountRowEditor's pattern
  //      (this is the common "I just paid this; let me adjust" action).
  //   2. Pencil → expand a small form below the row with every other field.
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountDraft, setAmountDraft] = useState(
    (bill.amountCents / 100).toFixed(2),
  );

  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(bill.name);
  const [cadence, setCadence] = useState<BillCadence>(bill.cadence);
  const [category, setCategory] = useState(bill.category);
  const [nextDueDate, setNextDueDate] = useState(bill.nextDueDate ?? "");

  function saveAmount() {
    const cents = parseToCents(amountDraft);
    if (cents !== bill.amountCents) {
      onUpdate({ id: bill.id, amountCents: cents });
    }
    setEditingAmount(false);
  }

  function saveOthers() {
    onUpdate({
      id: bill.id,
      name: name.trim() !== bill.name ? name.trim() : undefined,
      cadence: cadence !== bill.cadence ? cadence : undefined,
      category: category !== bill.category ? category : undefined,
      nextDueDate:
        (nextDueDate || null) !== (bill.nextDueDate ?? null)
          ? nextDueDate || null
          : undefined,
    });
    setExpanded(false);
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-medium text-trails-fg">
              {bill.name}
            </span>
            <span className="rounded-full border border-trails-trim/40 bg-trails-bg-deep/60 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider text-trails-accent">
              {bill.category.replace(/_/g, " ")}
            </span>
            <span className="font-display text-[10px] uppercase tracking-widest text-trails-fg-dim">
              {bill.cadence}
            </span>
            {bill.nextDueDate && (
              <span className="font-mono text-[10px] text-trails-fg-dim">
                · next {bill.nextDueDate}
              </span>
            )}
          </div>
        </div>
        {editingAmount ? (
          <input
            type="text"
            inputMode="decimal"
            value={amountDraft}
            autoFocus
            onChange={(e) => setAmountDraft(e.target.value)}
            onBlur={saveAmount}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveAmount();
              if (e.key === "Escape") setEditingAmount(false);
            }}
            className="w-28 rounded-md px-2 py-1 text-right text-sm tabular-nums"
          />
        ) : (
          <button
            onClick={() => {
              setAmountDraft((bill.amountCents / 100).toFixed(2));
              setEditingAmount(true);
            }}
            className="rounded px-2 py-1 text-right text-sm font-semibold tabular-nums hover:bg-trails-bg-glow"
            title="Click to update the bill's amount"
          >
            {formatCents(bill.amountCents, bill.currency)}
          </button>
        )}
        <button
          onClick={() => setExpanded((v) => !v)}
          title={
            expanded
              ? "Close edit panel"
              : "Edit name / cadence / category / next due date"
          }
          className="rounded-md border p-1.5 text-trails-fg-dim hover:text-trails-accent"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onArchive}
          title="Archive this bill"
          className="rounded-md border p-1.5 text-trails-fg-dim hover:text-trails-bad"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="mt-3 grid grid-cols-1 gap-2 border-t border-trails-trim/30 pt-3 sm:grid-cols-[1fr_140px_160px_140px_auto_auto]">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="rounded-md px-2 py-1 text-sm"
          />
          <select
            value={cadence}
            onChange={(e) => setCadence(e.target.value as BillCadence)}
            className="rounded-md px-2 py-1 text-sm"
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md px-2 py-1 text-sm"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={nextDueDate}
            onChange={(e) => setNextDueDate(e.target.value)}
            title="Next due date (clear to remove)"
            className="rounded-md px-2 py-1 text-sm"
          />
          <button
            onClick={saveOthers}
            disabled={!name.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
          >
            <Check className="h-3 w-3" /> Save
          </button>
          <button
            onClick={() => setExpanded(false)}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs"
          >
            <X className="h-3 w-3" /> Cancel
          </button>
        </div>
      )}
    </li>
  );
}

// ============================================================================
// Goals section
// ============================================================================

type GoalRow = {
  id: string;
  name: string;
  targetCents: number;
  currentCents: number;
  currency: string;
  targetDate: string | null;
  epicId: string | null;
  status: "active" | "achieved" | "abandoned";
  progress: number;
  epic: { id: string; title: string } | null;
};

function GoalsSection({
  goals,
  loading,
  currency,
  epics,
  onCreate,
  onUpdate,
  onArchive,
}: {
  goals: GoalRow[];
  loading: boolean;
  currency: string;
  epics: Array<{ id: string; title: string }>;
  onCreate: (input: {
    name: string;
    targetCents: number;
    currentCents: number;
    currency: string;
    targetDate?: string;
    epicId?: string | null;
  }) => void;
  onUpdate: (input: {
    id: string;
    name?: string;
    targetCents?: number;
    currentCents?: number;
    targetDate?: string | null;
    epicId?: string | null;
    status?: "active" | "achieved" | "abandoned";
    notes?: string | null;
  }) => void;
  onArchive: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [epicId, setEpicId] = useState("");

  const active = goals.filter((g) => g.status === "active");

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        <Target className="h-3.5 w-3.5" />
        Savings Goals
      </h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !target.trim()) return;
          onCreate({
            name: name.trim(),
            targetCents: parseToCents(target),
            currentCents: current ? parseToCents(current) : 0,
            currency,
            targetDate: targetDate || undefined,
            epicId: epicId || null,
          });
          setName("");
          setTarget("");
          setCurrent("");
          setTargetDate("");
          setEpicId("");
        }}
        className="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-zinc-200 bg-white p-3 sm:grid-cols-[1fr_120px_120px_140px_160px_auto] dark:border-zinc-800 dark:bg-zinc-900"
      >
        <input
          type="text"
          placeholder="Goal (e.g. Move to NL)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <input
          type="text"
          inputMode="decimal"
          placeholder="Target 0.00"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-right text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
        />
        <input
          type="text"
          inputMode="decimal"
          placeholder="Saved 0.00"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-right text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
        />
        <input
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          title="Target date (optional)"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <select
          value={epicId}
          onChange={(e) => setEpicId(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          <option value="">No epic link</option>
          {epics.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!name.trim() || !target.trim()}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Add
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-zinc-500">No active goals.</p>
      ) : (
        <ul className="space-y-2">
          {active.map((g) => (
            <GoalRowEditor
              key={g.id}
              goal={g}
              epics={epics}
              onUpdate={onUpdate}
              onArchive={() => onArchive(g.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function GoalRowEditor({
  goal,
  epics,
  onUpdate,
  onArchive,
}: {
  goal: GoalRow;
  epics: Array<{ id: string; title: string }>;
  onUpdate: (input: {
    id: string;
    name?: string;
    targetCents?: number;
    currentCents?: number;
    targetDate?: string | null;
    epicId?: string | null;
  }) => void;
  onArchive: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState((goal.currentCents / 100).toFixed(2));

  // Pencil drawer state — full edit: name / target / target date / epic.
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState((goal.targetCents / 100).toFixed(2));
  const [targetDate, setTargetDate] = useState(goal.targetDate ?? "");
  const [epicId, setEpicId] = useState(goal.epicId ?? "");

  function save() {
    const cents = parseToCents(draft);
    if (cents !== goal.currentCents) {
      onUpdate({ id: goal.id, currentCents: cents });
    }
    setEditing(false);
  }

  function saveOthers() {
    const targetC = parseToCents(target);
    onUpdate({
      id: goal.id,
      name: name.trim() !== goal.name ? name.trim() : undefined,
      targetCents: targetC !== goal.targetCents ? targetC : undefined,
      targetDate:
        (targetDate || null) !== (goal.targetDate ?? null)
          ? targetDate || null
          : undefined,
      epicId:
        (epicId || null) !== (goal.epicId ?? null)
          ? (epicId || null)
          : undefined,
    });
    setExpanded(false);
  }

  const pct = Math.round(goal.progress * 100);

  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-trails-fg">
              {goal.name}
            </span>
            {goal.epic && (
              <span
                className="rounded-full border border-trails-accent/40 bg-trails-accent/15 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider text-trails-accent"
                title="Linked epic"
              >
                {goal.epic.title}
              </span>
            )}
            {goal.targetDate && (
              <span className="font-mono text-[10px] text-trails-fg-dim">
                by {goal.targetDate}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <input
              type="text"
              inputMode="decimal"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-28 rounded-md px-2 py-1 text-right text-sm tabular-nums"
            />
          ) : (
            <button
              onClick={() => {
                setDraft((goal.currentCents / 100).toFixed(2));
                setEditing(true);
              }}
              className="rounded px-2 py-1 text-right text-sm font-semibold tabular-nums hover:bg-trails-bg-glow"
              title="Click to update saved amount (e.g. after a transfer to this goal)"
            >
              {formatCents(goal.currentCents, goal.currency)}
            </button>
          )}
          <span className="font-mono text-xs text-trails-fg-dim tabular-nums">
            / {formatCents(goal.targetCents, goal.currency)}
          </span>
          <button
            onClick={() => setExpanded((v) => !v)}
            title={
              expanded
                ? "Close edit panel"
                : "Edit name / target / target date / linked epic"
            }
            className="rounded-md border p-1.5 text-trails-fg-dim hover:text-trails-accent"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onArchive}
            title="Abandon this goal"
            className="rounded-md border p-1.5 text-trails-fg-dim hover:text-trails-bad"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 grid grid-cols-1 gap-2 border-t border-trails-trim/30 pt-3 sm:grid-cols-[1fr_120px_140px_1fr_auto_auto]">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="rounded-md px-2 py-1 text-sm"
          />
          <input
            type="text"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Target"
            className="rounded-md px-2 py-1 text-right text-sm tabular-nums"
          />
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            title="Target date (clear to remove)"
            className="rounded-md px-2 py-1 text-sm"
          />
          <select
            value={epicId}
            onChange={(e) => setEpicId(e.target.value)}
            className="rounded-md px-2 py-1 text-sm"
          >
            <option value="">— no epic link —</option>
            {epics.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
          <button
            onClick={saveOthers}
            disabled={!name.trim() || !target.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
          >
            <Check className="h-3 w-3" /> Save
          </button>
          <button
            onClick={() => setExpanded(false)}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs"
          >
            <X className="h-3 w-3" /> Cancel
          </button>
        </div>
      )}
      <div className="mt-2 flex items-center gap-3">
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-[width]",
              pct >= 100 ? "bg-emerald-500" : "bg-indigo-500",
            )}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">
          {pct}%
        </span>
      </div>
    </li>
  );
}
