import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { ReportTableCard } from './report-table-card';
import { useOperationsReportQuery, type ReportFilterParams, type OrderExceptionRow } from '@/lib/api/reports';
import { ExportCsvButton } from './export-csv-button';
import { describeError } from '@/lib/api/describe-error';

interface OperationsTabProps {
  params: ReportFilterParams;
}

function ExceptionList({ title, rows, emptyLabel }: { title: string; rows: OrderExceptionRow[]; emptyLabel: string }) {
  return (
    <ReportTableCard
      title={title}
      isEmpty={rows.length === 0}
      emptyLabel={emptyLabel}
      action={
        <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand">{rows.length}</span>
      }
    >
      <div className="max-h-72 divide-y divide-brand/10 overflow-y-auto">
        {rows.map((row) => (
          <Link
            key={row.orderId}
            to="/app/orders/$orderId"
            params={{ orderId: row.orderId }}
            className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-background/40"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{row.orderNumber}</p>
              <p className="truncate text-xs text-muted-foreground">
                {row.pickupCity} → {row.deliveryCity}
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
              {formatMoney(row.price, row.currency)}
            </p>
          </Link>
        ))}
      </div>
    </ReportTableCard>
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
        {describeError(error, 'Failed to load operations report')}
        <Button onClick={() => refetch()} variant="ghost" size="sm" className="ml-4">
          Retry
        </Button>
      </div>
    );
  }

  const currency = data.filters.currency || 'USD';
  const money = (amount: string | number) => formatMoney(amount, currency);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Money totals in <span className="font-semibold text-foreground">{currency}</span> only
        </p>
        <ExportCsvButton type="operations" params={params} />
      </div>
      {isFetching && !isLoading && <p className="text-xs text-muted-foreground">Refreshing for the new date range...</p>}

      <ReportTableCard
        title="Driver Performance"
        isEmpty={data.driverPerformance.length === 0}
        emptyLabel="No driver activity in this period"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Driver</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Total Orders</TableHead>
              <TableHead className="hidden text-right md:table-cell">Delivered</TableHead>
              <TableHead className="text-right">On-Time Rate</TableHead>
              <TableHead className="text-right">Delayed</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.driverPerformance.map((d) => (
              <TableRow key={d.driverId}>
                <TableCell className="font-medium text-foreground">
                  {d.name} <span className="text-xs text-muted-foreground">({d.employeeCode})</span>
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">{d.totalOrders}</TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">{d.deliveredOrders}</TableCell>
                <TableCell className="text-right tabular-nums">{d.onTimeRate.toFixed(1)}%</TableCell>
                <TableCell className="text-right tabular-nums">
                  <span className={d.delayedOrders > 0 ? 'text-destructive' : ''}>{d.delayedOrders}</span>
                </TableCell>
                <TableCell className="hidden text-right font-medium tabular-nums lg:table-cell">
                  {money(d.revenue)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ReportTableCard>

      <ReportTableCard
        title="Vehicle Utilization"
        isEmpty={data.vehiclePerformance.length === 0}
        emptyLabel="No vehicle activity in this period"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Total Orders</TableHead>
              <TableHead className="hidden text-right md:table-cell">Delivered</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Expenses</TableHead>
              <TableHead className="text-right">Est. Profit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.vehiclePerformance.map((v) => (
              <TableRow key={v.vehicleId}>
                <TableCell className="font-medium text-foreground">
                  {v.plateNumber} <span className="text-xs text-muted-foreground">({v.vehicleCode})</span>
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">{v.totalOrders}</TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">{v.deliveredOrders}</TableCell>
                <TableCell className="text-right tabular-nums">{money(v.revenue)}</TableCell>
                <TableCell className="hidden text-right tabular-nums lg:table-cell">
                  {money(v.approvedExpenses)}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right font-medium tabular-nums',
                    Number(v.estimatedGrossProfit) < 0 && 'text-destructive',
                  )}
                >
                  {money(v.estimatedGrossProfit)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ReportTableCard>

      <ReportTableCard
        title="Route Performance"
        isEmpty={data.routePerformance.length === 0}
        emptyLabel="No orders in this period"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Route</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Total Orders</TableHead>
              <TableHead className="text-right">Completion Rate</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.routePerformance.map((r) => (
              <TableRow key={`${r.pickupCity}-${r.deliveryCity}`}>
                <TableCell className="font-medium text-foreground">
                  {r.pickupCity} → {r.deliveryCity}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">{r.totalOrders}</TableCell>
                <TableCell className="text-right tabular-nums">{r.completionRate.toFixed(1)}%</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{money(r.revenue)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ReportTableCard>

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
