"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, LogOut, RefreshCw, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiClient, type ApiCustomer } from "@/lib/api-client";
import { useApiSession } from "@/lib/api-session";

function ConnectedModeBadge() {
  return (
    <Badge variant="outline" className="border-chart-5/30 bg-chart-5/10 text-chart-5">
      Connected Mode — apps/api
    </Badge>
  );
}

function NewCustomerForm({ onCreated }: { onCreated: () => void }) {
  const { callApi } = useApiSession();
  const [companyName, setCompanyName] = React.useState("");
  const [contactName, setContactName] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await callApi((token) => apiClient.createCustomer(token, { companyName, contactName }));
      setCompanyName("");
      setContactName("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-muted-foreground" htmlFor="new-company-name">
          Company name
        </label>
        <Input
          id="new-company-name"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          className="w-48"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground" htmlFor="new-contact-name">
          Contact name
        </label>
        <Input
          id="new-contact-name"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          className="w-48"
          required
        />
      </div>
      <Button type="submit" size="sm" disabled={submitting} className="gap-1.5">
        <UserPlus className="size-3.5" />
        {submitting ? "Creating…" : "Create Customer"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

type LoadState = "loading" | "loaded" | "error" | "session-expired";

export function CustomersConnectedView() {
  const router = useRouter();
  const { session, logout, callApi } = useApiSession();
  const [customers, setCustomers] = React.useState<ApiCustomer[]>([]);
  const [loadState, setLoadState] = React.useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  const [reloadToken, setReloadToken] = React.useState(0);

  React.useEffect(() => {
    // ProtectedApiRoute (see (app)/customers/page.tsx) guarantees a session
    // exists before this component ever mounts — this is just a defensive
    // guard against a race on the very first render.
    if (!session) return;
    let cancelled = false;

    // Every setState call below lives inside a .then()/.catch() callback,
    // none as a bare statement in the effect body — this codebase's Next.js
    // config treats even the canonical "set loading, then fetch" pattern as
    // a synchronous setState-in-effect (react-hooks/set-state-in-effect),
    // so the loading flag itself is set via a resolved-promise callback too.
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoadState("loading");
      setErrorMessage(null);
    });

    callApi((token) => apiClient.listCustomers(token, { search: search.trim() || undefined, limit: 50 })).then(
      (result) => {
        if (cancelled) return;
        setCustomers(result.items);
        setLoadState("loaded");
      },
      (error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load customers";
        setErrorMessage(message);
        setLoadState(/invalid|expired|unauthorized|not signed in/i.test(message) ? "session-expired" : "error");
      },
    );

    return () => {
      cancelled = true;
    };
  }, [session, search, reloadToken, callApi]);

  const load = React.useCallback(() => setReloadToken((n) => n + 1), []);

  function handleSignInAgain() {
    logout();
    router.push("/auth/login?redirect=%2Fcustomers");
  }

  if (loadState === "session-expired") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Customers</h1>
          <ConnectedModeBadge />
        </div>
        <Card className="mx-auto max-w-md">
          <CardContent className="space-y-3 py-6 text-center">
            <AlertTriangle className="mx-auto size-6 text-destructive" />
            <p className="text-sm font-medium">Your session has expired</p>
            <p className="text-sm text-muted-foreground">
              Sign in again to continue viewing customers in Connected Mode.
            </p>
            <Button onClick={handleSignInAgain} className="gap-1.5">
              <LogOut className="size-3.5" />
              Sign in again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Customers</h1>
          <ConnectedModeBadge />
        </div>
        {session && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              Signed in as {session.user.email} · {session.organization.name}
            </span>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search company, contact, email, phone, city…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => load()}
              disabled={loadState === "loading"}
              className="gap-1.5"
            >
              <RefreshCw className={`size-3.5 ${loadState === "loading" ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <NewCustomerForm onCreated={() => load()} />

          {loadState === "loading" && (
            <p className="flex items-center gap-1.5 py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading customers…
            </p>
          )}

          {loadState === "error" && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <AlertTriangle className="size-5 text-destructive" />
              <p className="text-sm text-destructive">{errorMessage}</p>
              <p className="text-xs text-muted-foreground">
                Is apps/api running at the configured NEXT_PUBLIC_API_URL?
              </p>
              <Button variant="outline" size="sm" onClick={() => load()} className="gap-1.5">
                <RefreshCw className="size-3.5" />
                Retry
              </Button>
            </div>
          )}

          {loadState === "loaded" && customers.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No customers yet in this organization. Create one above.
            </p>
          )}

          {loadState === "loaded" && customers.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Credit Limit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">{customer.customerCode}</TableCell>
                    <TableCell>{customer.companyName}</TableCell>
                    <TableCell className="text-muted-foreground">{customer.contactName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{customer.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{customer.creditLimit}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        This is a transitional foundation view — only Customers runs in Connected Mode. Every
        other module (Orders, Dispatch, Finance, Reports, AI Assistant, ...) still uses the
        localStorage demo, even while this page is connected to apps/api.
      </p>
    </div>
  );
}
