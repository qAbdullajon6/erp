"use client";

import React, { useEffect, useState } from "react";
import { Loader2, AlertTriangle, ShieldAlert } from "lucide-react";
import { useApiSession } from "@/lib/api-session";
import { apiClient, type ExecutiveOverviewReport, type OperationsReport, type FinancialReport } from "@/lib/api-client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

type SectionState = "loading" | "loaded" | "error" | "session-expired" | "forbidden";

function SectionMessage({ state, message, onRetry }: { state: SectionState; message: string; onRetry: () => void }) {
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
      <p className="flex items-center gap-1.5 py-8 text-center text-sm text-destructive">
        <ShieldAlert className="size-4" />
        You don&apos;t have access to this report.
      </p>
    );
  }
  if (state === "session-expired") {
    return (
      <p className="flex items-center gap-1.5 py-8 text-center text-sm text-destructive">
        <AlertTriangle className="size-4" />
        {message}
      </p>
    );
  }
  if (state === "error") {
    return (
      <div className="space-y-2 py-8">
        <p className="flex items-center gap-1.5 text-center text-sm text-destructive">
          <AlertTriangle className="size-4" />
          {message}
        </p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  return null;
}

interface ReportState {
  executive: { data: ExecutiveOverviewReport | null; state: SectionState; error: string };
  operations: { data: OperationsReport | null; state: SectionState; error: string };
  financial: { data: FinancialReport | null; state: SectionState; error: string };
}

function classifyError(error: unknown): { state: SectionState; message: string } {
  const message = error instanceof Error ? error.message : "Something went wrong";
  if (message.includes("403")) return { state: "forbidden", message: "You don&apos;t have access to this report" };
  if (/invalid|expired|unauthorized|not signed in/i.test(message)) return { state: "session-expired", message };
  return { state: "error", message };
}

export function ReportsConnectedView() {
  const { session, callApi } = useApiSession();
  const [tab, setTab] = useState<"executive" | "operations" | "financial">("executive");
  const [reports, setReports] = useState<ReportState>({
    executive: { data: null, state: "loading", error: "" },
    operations: { data: null, state: "loading", error: "" },
    financial: { data: null, state: "loading", error: "" },
  });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const fetchReports = async () => {
      const newReports = { ...reports };
      for (const reportType of ["executive", "operations", "financial"] as const) {
        newReports[reportType].state = "loading";
        newReports[reportType].error = "";
      }
      setReports(newReports);

      try {
        const [executive, operations, financial] = await Promise.all([
          callApi((token) => apiClient.getExecutiveOverviewReport(token, {})),
          callApi((token) => apiClient.getOperationsReport(token, {})),
          callApi((token) => apiClient.getFinancialReport(token, {})),
        ]);

        if (!cancelled) {
          setReports({
            executive: { data: executive, state: "loaded", error: "" },
            operations: { data: operations, state: "loaded", error: "" },
            financial: { data: financial, state: "loaded", error: "" },
          });
        }
      } catch (error) {
        if (!cancelled) {
          const { state, message } = classifyError(error);
          setReports({
            executive: { data: null, state, error: message },
            operations: { data: null, state, error: message },
            financial: { data: null, state, error: message },
          });
        }
      }
    };

    Promise.resolve().then(() => { if (!cancelled) fetchReports(); });
    return () => { cancelled = true; };
  }, [session, reloadToken, callApi]);

  const reload = () => setReloadToken((n) => n + 1);

  const currentReport = reports[tab];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="text-sm text-muted-foreground mt-2">Real-time logistics insights from your organization.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="executive">Executive Overview</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
        </TabsList>

        <TabsContent value="executive" className="space-y-4">
          {currentReport.state === "loading" && (
            <SectionMessage state="loading" message="" onRetry={reload} />
          )}
          {currentReport.state === "error" && (
            <SectionMessage state="error" message={currentReport.error} onRetry={reload} />
          )}
          {currentReport.state === "session-expired" && (
            <SectionMessage state="session-expired" message={currentReport.error} onRetry={reload} />
          )}
          {currentReport.state === "forbidden" && (
            <SectionMessage state="forbidden" message="" onRetry={reload} />
          )}
          {currentReport.state === "loaded" && currentReport.data && tab === "executive" && (
            <div className="text-sm text-muted-foreground">
              <p>Total Orders: {(currentReport.data as ExecutiveOverviewReport).totals.totalOrders}</p>
              <p>Delivered: {(currentReport.data as ExecutiveOverviewReport).totals.deliveredOrders}</p>
              <p>Revenue: {(currentReport.data as ExecutiveOverviewReport).totals.totalRevenue}</p>
              <p>Gross Profit: {(currentReport.data as ExecutiveOverviewReport).totals.estimatedGrossProfit}</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="operations" className="space-y-4">
          {currentReport.state !== "loaded" && (
            <SectionMessage state={currentReport.state} message={currentReport.error} onRetry={reload} />
          )}
          {currentReport.state === "loaded" && currentReport.data && (
            <div className="text-sm text-muted-foreground">
              <p>Delayed Orders: {(currentReport.data as OperationsReport).exceptions.delayedOrders.length}</p>
              <p>Unassigned Orders: {(currentReport.data as OperationsReport).exceptions.unassignedActiveOrders.length}</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="financial" className="space-y-4">
          {currentReport.state !== "loaded" && (
            <SectionMessage state={currentReport.state} message={currentReport.error} onRetry={reload} />
          )}
          {currentReport.state === "loaded" && currentReport.data && (
            <div className="text-sm text-muted-foreground">
              <p>Receivables Aging: {(currentReport.data as FinancialReport).receivablesAging.length} buckets</p>
              <p>Profitability Label: {(currentReport.data as FinancialReport).profitability.label}</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        Reports are computed in real-time from your organization&apos;s data. Full report visualization coming soon.
      </p>
    </div>
  );
}
