import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/format';
import { useOperationsReportQuery, type ReportFilterParams, type OrderExceptionRow } from '@/lib/api/reports';
import { ExportCsvButton } from './export-csv-button';

interface OperationsTabProps {
  params: ReportFilterParams;
}

function ExceptionList({ title, rows, emptyLabel }: { title: string; rows: OrderExceptionRow[]; emptyLabel: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50">
      <div className="flex items-center justify-between border-b border-brand/10 px-6 py-4">
        <h3 className="font-display text-base font-bold text-foreground">{title}</h3>
        <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-6 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="max-h-72 divide-y divide-brand/10 overflow-y-auto">
          {rows.map((row) => (
            <Link
              key={row.orderId}
              to="/app/orders/$orderId"
              params={{ orderId: row.orderId }}
              className="flex items-center justify-between px-6 py-3 transition-colors hover:bg-background/40"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{row.orderNumber}</p>
                <p className="text-xs text-muted-foreground">
                  {row.pickupCity} → {row.deliveryCity}
                </p>
              </div>
              <p className="text-sm font-semibold text-foreground">{formatMoney(row.price, row.currency)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function OperationsTab({ params }: OperationsTabProps) {
  const { data, isLoading, isFetching, isError, error, refetch } = useOperationsReportQuery(params);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg bg-destructive/10 p-6 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Failed to load operations report'}
        <Button onClick={() => refetch()} variant="ghost" size="sm" className="ml-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ExportCsvButton type="operations" params={params} />
      </div>
      {isFetching && !isLoading && <p className="text-xs text-muted-foreground">Refreshing for the new date range...</p>}

      <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50">
        <div className="border-b border-brand/10 px-6 py-4">
          <h3 className="font-display text-lg font-bold text-foreground">Driver Performance</h3>
        </div>
        {data.driverPerformance.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">No driver activity in this period</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand/10 bg-surface/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-6 py-3">Driver</th>
                  <th className="px-6 py-3 text-right">Total Orders</th>
                  <th className="px-6 py-3 text-right">Delivered</th>
                  <th className="px-6 py-3 text-right">On-Time Rate</th>
                  <th className="px-6 py-3 text-right">Delayed</th>
                  <th className="px-6 py-3 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand/10">
                {data.driverPerformance.map((d) => (
                  <tr key={d.driverId}>
                    <td className="px-6 py-3 font-medium text-foreground">
                      {d.name} <span className="text-xs text-muted-foreground">({d.employeeCode})</span>
                    </td>
                    <td className="px-6 py-3 text-right">{d.totalOrders}</td>
                    <td className="px-6 py-3 text-right">{d.deliveredOrders}</td>
                    <td className="px-6 py-3 text-right">{d.onTimeRate.toFixed(1)}%</td>
                    <td className="px-6 py-3 text-right">
                      <span className={d.delayedOrders > 0 ? 'text-destructive' : ''}>{d.delayedOrders}</span>
                    </td>
                    <td className="px-6 py-3 text-right font-medium">{formatMoney(d.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50">
        <div className="border-b border-brand/10 px-6 py-4">
          <h3 className="font-display text-lg font-bold text-foreground">Vehicle Utilization</h3>
        </div>
        {data.vehiclePerformance.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">No vehicle activity in this period</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand/10 bg-surface/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-6 py-3">Vehicle</th>
                  <th className="px-6 py-3 text-right">Total Orders</th>
                  <th className="px-6 py-3 text-right">Delivered</th>
                  <th className="px-6 py-3 text-right">Revenue</th>
                  <th className="px-6 py-3 text-right">Expenses</th>
                  <th className="px-6 py-3 text-right">Est. Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand/10">
                {data.vehiclePerformance.map((v) => (
                  <tr key={v.vehicleId}>
                    <td className="px-6 py-3 font-medium text-foreground">
                      {v.plateNumber} <span className="text-xs text-muted-foreground">({v.vehicleCode})</span>
                    </td>
                    <td className="px-6 py-3 text-right">{v.totalOrders}</td>
                    <td className="px-6 py-3 text-right">{v.deliveredOrders}</td>
                    <td className="px-6 py-3 text-right">{formatMoney(v.revenue)}</td>
                    <td className="px-6 py-3 text-right">{formatMoney(v.approvedExpenses)}</td>
                    <td className={`px-6 py-3 text-right font-medium ${Number(v.estimatedGrossProfit) < 0 ? 'text-destructive' : ''}`}>
                      {formatMoney(v.estimatedGrossProfit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50">
        <div className="border-b border-brand/10 px-6 py-4">
          <h3 className="font-display text-lg font-bold text-foreground">Route Performance</h3>
        </div>
        {data.routePerformance.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">No orders in this period</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand/10 bg-surface/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-6 py-3">Route</th>
                  <th className="px-6 py-3 text-right">Total Orders</th>
                  <th className="px-6 py-3 text-right">Completion Rate</th>
                  <th className="px-6 py-3 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand/10">
                {data.routePerformance.map((r) => (
                  <tr key={`${r.pickupCity}-${r.deliveryCity}`}>
                    <td className="px-6 py-3 font-medium text-foreground">
                      {r.pickupCity} → {r.deliveryCity}
                    </td>
                    <td className="px-6 py-3 text-right">{r.totalOrders}</td>
                    <td className="px-6 py-3 text-right">{r.completionRate.toFixed(1)}%</td>
                    <td className="px-6 py-3 text-right font-medium">{formatMoney(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-4 font-display text-lg font-bold text-foreground">Exceptions</h3>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ExceptionList title="Delayed Orders" rows={data.exceptions.delayedOrders} emptyLabel="Nothing is delayed right now" />
          <ExceptionList
            title="Unassigned Orders"
            rows={data.exceptions.unassignedActiveOrders}
            emptyLabel="Everything pending has a driver and vehicle"
          />
          <ExceptionList title="Cancelled Orders" rows={data.exceptions.cancelledOrders} emptyLabel="No cancellations in this period" />
          <ExceptionList
            title="Negative-Profit Orders"
            rows={data.exceptions.negativeProfitOrders}
            emptyLabel="No delivered orders ran at a loss"
          />
          <ExceptionList
            title="Delivered Without Invoice"
            rows={data.exceptions.deliveredWithoutInvoice}
            emptyLabel="Every delivered order in this period has been invoiced"
          />
        </div>
      </div>
    </div>
  );
}
