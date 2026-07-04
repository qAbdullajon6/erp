"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  DollarSign,
  FilePlus,
  Loader2,
  LogOut,
  ReceiptText,
  RefreshCw,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ApiRequestError,
  apiClient,
  type ApiCustomer,
  type ApiExpense,
  type ApiExpenseCategory,
  type ApiInvoice,
  type ApiPayment,
  type ApiPaymentMethod,
  type FinanceSummaryResult,
} from "@/lib/api-client";
import { useApiSession } from "@/lib/api-session";

function ConnectedModeBadge() {
  return (
    <Badge variant="outline" className="border-chart-5/30 bg-chart-5/10 text-chart-5">
      Connected Mode — apps/api
    </Badge>
  );
}

type SectionState = "loading" | "loaded" | "error" | "session-expired" | "forbidden";

function classifyError(error: unknown): { state: SectionState; message: string } {
  const message = error instanceof Error ? error.message : "Something went wrong";
  if (error instanceof ApiRequestError && error.status === 403) {
    return { state: "forbidden", message };
  }
  if (/invalid|expired|unauthorized|not signed in/i.test(message)) {
    return { state: "session-expired", message };
  }
  return { state: "error", message };
}

function SectionMessage({
  state,
  errorMessage,
  onRetry,
  emptyText,
  isEmpty,
}: {
  state: SectionState;
  errorMessage: string | null;
  onRetry: () => void;
  emptyText?: string;
  isEmpty?: boolean;
}) {
  if (state === "loading") {
    return (
      <p className="flex items-center gap-1.5 py-8 text-center text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading…
      </p>
    );
  }
  if (state === "forbidden") {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <ShieldAlert className="size-5 text-destructive" />
        <p className="text-sm font-medium">You don&apos;t have access to this</p>
        <p className="text-xs text-muted-foreground">Your role doesn&apos;t include this finance area.</p>
      </div>
    );
  }
  if (state === "error" || state === "session-expired") {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <AlertTriangle className="size-5 text-destructive" />
        <p className="text-sm text-destructive">{errorMessage}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
          <RefreshCw className="size-3.5" />
          Retry
        </Button>
      </div>
    );
  }
  if (isEmpty && emptyText) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  return null;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function FinanceSummarySection() {
  const { session, callApi } = useApiSession();
  const [summary, setSummary] = React.useState<FinanceSummaryResult | null>(null);
  const [state, setState] = React.useState<SectionState>("loading");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);

  React.useEffect(() => {
    if (!session) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setState("loading");
      setErrorMessage(null);
    });
    callApi((token) => apiClient.financeSummary(token)).then(
      (result) => {
        if (cancelled) return;
        setSummary(result);
        setState("loaded");
      },
      (error: unknown) => {
        if (cancelled) return;
        const classified = classifyError(error);
        setErrorMessage(classified.message);
        setState(classified.state);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [session, callApi, reloadToken]);

  const reload = React.useCallback(() => setReloadToken((n) => n + 1), []);

  if (state !== "loaded" || !summary) {
    return <SectionMessage state={state} errorMessage={errorMessage} onRetry={reload} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Invoiced" value={`${summary.invoices.totalInvoiced}`} />
        <StatCard label="Total Collected" value={`${summary.invoices.totalCollected}`} />
        <StatCard label="Total Outstanding" value={`${summary.invoices.totalOutstanding}`} />
        <StatCard
          label="Overdue"
          value={`${summary.invoices.overdueAmount}`}
          sub={`${summary.invoices.overdueCount} invoice(s)`}
        />
        <StatCard label="Pending Expenses" value={String(summary.expenses.pendingCount)} />
        <StatCard label="Approved Expenses" value={`${summary.expenses.approvedTotal}`} />
        <StatCard label="Estimated Gross Profit" value={`${summary.estimatedGrossProfit}`} />
      </div>
      <p className="text-xs text-muted-foreground">
        Estimated Gross Profit = total collected across all non-cancelled invoices − total approved
        expenses. A coarse org-wide signal, not full accounting.
      </p>
    </div>
  );
}

function NewInvoiceForm({ onCreated }: { onCreated: () => void }) {
  const { session, callApi } = useApiSession();
  const [customers, setCustomers] = React.useState<ApiCustomer[]>([]);
  const [customerId, setCustomerId] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [unitPrice, setUnitPrice] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!session) return;
    let cancelled = false;
    callApi((token) => apiClient.listCustomers(token, { status: "ACTIVE", limit: 100 })).then(
      (result) => {
        if (cancelled) return;
        setCustomers(result.items);
      },
      () => {
        // silent — the create form just shows "no active customers" below
      },
    );
    return () => {
      cancelled = true;
    };
  }, [session, callApi]);

  const effectiveCustomerId = customerId || customers[0]?.id || "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveCustomerId) {
      setError("Create an active customer first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await callApi((token) =>
        apiClient.createInvoice(token, {
          customerId: effectiveCustomerId,
          lineItems: [{ description, quantity: Number(quantity), unitPrice: Number(unitPrice) }],
        }),
      );
      setDescription("");
      setQuantity("1");
      setUnitPrice("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setSubmitting(false);
    }
  }

  if (customers.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-3 text-xs text-muted-foreground">
        No active customers yet — create one on the Customers page before creating an invoice.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">Customer</Label>
          <Select value={effectiveCustomerId} onValueChange={setCustomerId}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.companyName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-40">
          <Label className="mb-1 block text-xs text-muted-foreground">Line description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} required />
        </div>
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">Qty</Label>
          <Input type="number" min="0.01" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-20" required />
        </div>
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">Unit price</Label>
          <Input type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="w-28" required />
        </div>
        <Button type="submit" size="sm" disabled={submitting} className="gap-1.5">
          <FilePlus className="size-3.5" />
          {submitting ? "Creating…" : "Create Invoice"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

const PAYMENT_METHODS: ApiPaymentMethod[] = ["CASH", "BANK_TRANSFER", "CARD", "OTHER"];

function RecordPaymentDialog({ invoice, onRecorded }: { invoice: ApiInvoice; onRecorded: () => void }) {
  const { callApi } = useApiSession();
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<ApiPaymentMethod>("BANK_TRANSFER");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await callApi((token) => apiClient.recordPayment(token, invoice.id, { amount: Number(amount), method }));
      setOpen(false);
      setAmount("");
      onRecorded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Wallet className="size-3.5" />
          Record Payment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment — {invoice.invoiceNumber}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Balance due: {invoice.balanceDue} {invoice.currency}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="payment-amount">Amount</Label>
            <Input
              id="payment-amount"
              type="number"
              min="0.01"
              step="0.01"
              max={invoice.balanceDue}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as ApiPaymentMethod)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Recording…" : "Record Payment"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceRow({ invoice, canFinalize, onChanged }: { invoice: ApiInvoice; canFinalize: boolean; onChanged: () => void }) {
  const { callApi } = useApiSession();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSend() {
    setBusy(true);
    setError(null);
    try {
      await callApi((token) => apiClient.sendInvoice(token, invoice.id));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invoice");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    setBusy(true);
    setError(null);
    try {
      await callApi((token) => apiClient.cancelInvoice(token, invoice.id));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel invoice");
    } finally {
      setBusy(false);
    }
  }

  const canRecordPayment = canFinalize && ["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status);
  const canCancel = canFinalize && invoice.status !== "PAID" && invoice.status !== "CANCELLED";

  return (
    <TableRow>
      <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
      <TableCell>
        <Badge variant="outline">{invoice.status}</Badge>
      </TableCell>
      <TableCell className="text-right">{invoice.totalAmount}</TableCell>
      <TableCell className="text-right">{invoice.balanceDue}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1.5">
          {canFinalize && invoice.status === "DRAFT" && (
            <Button variant="outline" size="sm" disabled={busy} onClick={handleSend}>
              Send
            </Button>
          )}
          {canRecordPayment && <RecordPaymentDialog invoice={invoice} onRecorded={onChanged} />}
          {canCancel && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={handleCancel} className="text-destructive hover:text-destructive">
              Cancel
            </Button>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </TableCell>
    </TableRow>
  );
}

function InvoicesSection({ canFinalize }: { canFinalize: boolean }) {
  const { session, callApi } = useApiSession();
  const [invoices, setInvoices] = React.useState<ApiInvoice[]>([]);
  const [state, setState] = React.useState<SectionState>("loading");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [reloadToken, setReloadToken] = React.useState(0);

  React.useEffect(() => {
    if (!session) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setState("loading");
      setErrorMessage(null);
    });
    callApi((token) =>
      apiClient.listInvoices(token, { search: search.trim() || undefined, limit: 50, sortBy: "createdAt", sortOrder: "desc" }),
    ).then(
      (result) => {
        if (cancelled) return;
        setInvoices(result.items);
        setState("loaded");
      },
      (error: unknown) => {
        if (cancelled) return;
        const classified = classifyError(error);
        setErrorMessage(classified.message);
        setState(classified.state);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [session, search, reloadToken, callApi]);

  const reload = React.useCallback(() => setReloadToken((n) => n + 1), []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search invoice number…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <Button variant="outline" size="sm" onClick={reload} disabled={state === "loading"} className="gap-1.5">
          <RefreshCw className={`size-3.5 ${state === "loading" ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {canFinalize && <NewInvoiceForm onCreated={reload} />}

      <SectionMessage
        state={state}
        errorMessage={errorMessage}
        onRetry={reload}
        isEmpty={invoices.length === 0}
        emptyText="No invoices yet in this organization. Create one above, or invoice a delivered order from the Orders page."
      />

      {state === "loaded" && invoices.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Balance Due</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <InvoiceRow key={invoice.id} invoice={invoice} canFinalize={canFinalize} onChanged={reload} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function PaymentsSection() {
  const { session, callApi } = useApiSession();
  const [payments, setPayments] = React.useState<ApiPayment[]>([]);
  const [state, setState] = React.useState<SectionState>("loading");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);

  React.useEffect(() => {
    if (!session) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setState("loading");
      setErrorMessage(null);
    });
    callApi((token) => apiClient.listPayments(token, { limit: 50, sortBy: "paymentDate", sortOrder: "desc" })).then(
      (result) => {
        if (cancelled) return;
        setPayments(result.items);
        setState("loaded");
      },
      (error: unknown) => {
        if (cancelled) return;
        const classified = classifyError(error);
        setErrorMessage(classified.message);
        setState(classified.state);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [session, reloadToken, callApi]);

  const reload = React.useCallback(() => setReloadToken((n) => n + 1), []);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={reload} disabled={state === "loading"} className="gap-1.5">
          <RefreshCw className={`size-3.5 ${state === "loading" ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <SectionMessage
        state={state}
        errorMessage={errorMessage}
        onRetry={reload}
        isEmpty={payments.length === 0}
        emptyText="No payments recorded yet. Record one from an invoice's row on the Invoices tab."
      />

      {state === "loaded" && payments.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{new Date(p.paymentDate).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Badge variant="outline">{p.method}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{p.reference ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {p.amount} {p.currency}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

const EXPENSE_CATEGORIES: ApiExpenseCategory[] = [
  "FUEL",
  "TOLL",
  "MAINTENANCE",
  "DRIVER_ADVANCE",
  "PARKING",
  "INSURANCE",
  "OTHER",
];

function NewExpenseForm({ onCreated }: { onCreated: () => void }) {
  const { callApi } = useApiSession();
  const [category, setCategory] = React.useState<ApiExpenseCategory>("FUEL");
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await callApi((token) => apiClient.createExpense(token, { category, description, amount: Number(amount) }));
      setDescription("");
      setAmount("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create expense");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as ApiExpenseCategory)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-40">
          <Label className="mb-1 block text-xs text-muted-foreground">Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} required />
        </div>
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">Amount</Label>
          <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28" required />
        </div>
        <Button type="submit" size="sm" disabled={submitting} className="gap-1.5">
          <ReceiptText className="size-3.5" />
          {submitting ? "Creating…" : "Create Expense"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

function ExpenseRow({ expense, canApprove, onChanged }: { expense: ApiExpense; canApprove: boolean; onChanged: () => void }) {
  const { callApi } = useApiSession();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleApprove() {
    setBusy(true);
    setError(null);
    try {
      await callApi((token) => apiClient.approveExpense(token, expense.id));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve expense");
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    setError(null);
    try {
      await callApi((token) => apiClient.rejectExpense(token, expense.id));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject expense");
    } finally {
      setBusy(false);
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{expense.expenseNumber}</TableCell>
      <TableCell>
        <Badge variant="outline">{expense.category}</Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">{expense.description}</TableCell>
      <TableCell>
        <Badge variant="outline">{expense.status}</Badge>
      </TableCell>
      <TableCell className="text-right">
        {expense.amount} {expense.currency}
      </TableCell>
      <TableCell className="text-right">
        {canApprove && expense.status === "PENDING" && (
          <div className="flex items-center justify-end gap-1.5">
            <Button variant="outline" size="sm" disabled={busy} onClick={handleApprove}>
              Approve
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={handleReject} className="text-destructive hover:text-destructive">
              Reject
            </Button>
          </div>
        )}
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </TableCell>
    </TableRow>
  );
}

function ExpensesSection({ canCreate, canApprove }: { canCreate: boolean; canApprove: boolean }) {
  const { session, callApi } = useApiSession();
  const [expenses, setExpenses] = React.useState<ApiExpense[]>([]);
  const [state, setState] = React.useState<SectionState>("loading");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);

  React.useEffect(() => {
    if (!session) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setState("loading");
      setErrorMessage(null);
    });
    callApi((token) => apiClient.listExpenses(token, { limit: 50, sortBy: "createdAt", sortOrder: "desc" })).then(
      (result) => {
        if (cancelled) return;
        setExpenses(result.items);
        setState("loaded");
      },
      (error: unknown) => {
        if (cancelled) return;
        const classified = classifyError(error);
        setErrorMessage(classified.message);
        setState(classified.state);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [session, reloadToken, callApi]);

  const reload = React.useCallback(() => setReloadToken((n) => n + 1), []);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={reload} disabled={state === "loading"} className="gap-1.5">
          <RefreshCw className={`size-3.5 ${state === "loading" ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {canCreate && <NewExpenseForm onCreated={reload} />}

      <SectionMessage
        state={state}
        errorMessage={errorMessage}
        onRetry={reload}
        isEmpty={expenses.length === 0}
        emptyText="No expenses recorded yet in this organization."
      />

      {state === "loaded" && expenses.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Expense #</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((expense) => (
              <ExpenseRow key={expense.id} expense={expense} canApprove={canApprove} onChanged={reload} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export function FinanceConnectedView() {
  const router = useRouter();
  const { session, logout } = useApiSession();

  if (!session) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Finance</h1>
          <ConnectedModeBadge />
        </div>
        <p className="py-8 text-center text-sm text-muted-foreground">Checking your session…</p>
      </div>
    );
  }

  const role = session.membership.role;
  const canFinalizeInvoices = role === "ADMIN" || role === "ACCOUNTANT";
  const canCreateExpenses = role === "ADMIN" || role === "ACCOUNTANT" || role === "OPERATIONS_MANAGER";
  const canApproveExpenses = role === "ADMIN" || role === "ACCOUNTANT";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Finance</h1>
          <ConnectedModeBadge />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            Signed in as {session.user.email} · {session.organization.name}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              logout();
              router.push("/auth/login?redirect=%2Ffinance");
            }}
            className="gap-1.5"
          >
            <LogOut className="size-3.5" />
            Sign out
          </Button>
        </div>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1.5">
            <DollarSign className="size-3.5" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <FinanceSummarySection />
        </TabsContent>
        <TabsContent value="invoices" className="mt-4">
          <InvoicesSection canFinalize={canFinalizeInvoices} />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <PaymentsSection />
        </TabsContent>
        <TabsContent value="expenses" className="mt-4">
          <ExpensesSection canCreate={canCreateExpenses} canApprove={canApproveExpenses} />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        This is a transitional foundation view — Invoices/Payments/Expenses are real, API-backed data.
        Every other module (Reports, Notifications, AI Assistant, ...) still uses the localStorage demo.
      </p>
    </div>
  );
}
