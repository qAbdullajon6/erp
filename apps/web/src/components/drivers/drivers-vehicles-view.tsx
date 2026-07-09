'use client';

import { useEffect } from 'react';
import { useDrivers } from '@/lib/api/drivers';

export function DriversVehiclesView() {
  const { data: drivers, loading, error, refetch, fetch } = useDrivers(1, 10);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-success/10 text-success";
      case "ON_BREAK":
        return "bg-warning/10 text-warning";
      case "INACTIVE":
        return "bg-muted text-muted-foreground";
      case "SUSPENDED":
        return "bg-destructive/10 text-destructive";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      ACTIVE: "Active",
      ON_BREAK: "On Break",
      INACTIVE: "Inactive",
      SUSPENDED: "Suspended",
    };
    return labels[status] || status;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Drivers & Fleet Management</h1>
        <p className="mt-2 text-muted-foreground">Manage your drivers and track vehicle status</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Total Drivers</div>
          <div className="mt-3 font-display text-3xl font-bold text-foreground">{loading ? "—" : drivers.length}</div>
          <div className="mt-2 text-sm text-success">
            {loading ? "Loading..." : `${drivers.filter(d => d.status === "ACTIVE").length} active`}
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">License Expirations</div>
          <div className="mt-3 font-display text-3xl font-bold text-foreground">
            {loading ? "—" : drivers.filter(d => {
              const expiry = new Date(d.licenseExpiry);
              const now = new Date();
              const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
              return expiry < thirtyDaysFromNow && expiry > now;
            }).length}
          </div>
          <div className="mt-2 text-sm text-warning">Expiring in 30 days</div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Avg. Rating</div>
          <div className="mt-3 font-display text-3xl font-bold text-foreground">
            {loading ? "—" : drivers.length > 0 ? (drivers.reduce((sum, d) => sum + (d.rating || 0), 0) / drivers.length).toFixed(1) : "—"}⭐
          </div>
          <div className="mt-2 text-sm text-success">Performance</div>
        </div>
      </div>

      {/* Drivers List */}
      <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50">
        <div className="border-b border-brand/10 px-8 py-6">
          <h2 className="font-display text-2xl font-bold text-foreground">Driver Roster</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? "Loading drivers..." : error ? "Error loading drivers" : `${drivers.length} drivers`}
          </p>
        </div>
        <div className="divide-y divide-brand/10">
          {loading && (
            <div className="px-8 py-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
              <p className="mt-4 text-sm text-muted-foreground">Loading drivers...</p>
            </div>
          )}
          {error && (
            <div className="px-8 py-6">
              <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
                {error}
                <button
                  onClick={() => refetch()}
                  className="ml-2 font-semibold underline hover:no-underline"
                >
                  Retry
                </button>
              </div>
            </div>
          )}
          {!loading && !error && drivers.length === 0 && (
            <div className="px-8 py-12 text-center">
              <p className="text-muted-foreground">No drivers found</p>
            </div>
          )}
          {!loading && drivers.map((driver) => (
            <div key={driver.id} className="border-b border-brand/5 px-8 py-6 transition-colors hover:bg-background/40">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-semibold text-foreground">{driver.firstName} {driver.lastName}</div>
                  <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                    <span>📱 {driver.phone}</span>
                    <span>•</span>
                    <span>🎫 License: {driver.licenseNumber}</span>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-sm font-medium text-muted-foreground">License Expires</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {new Date(driver.licenseExpiry).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-muted-foreground">Rating</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{driver.rating?.toFixed(1) || "—"} ⭐</div>
                  </div>
                  <div className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(driver.status)}`}>
                    {getStatusLabel(driver.status)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
