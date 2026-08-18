import {
  Activity,
  AlertTriangle,
  Fuel,
  Gauge,
  MapPin,
  Route,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MetricCard } from '@/components/ui/metric-card';
import { SurfaceCard } from '@/components/ui/surface-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFleetTelematicsReportQuery } from '@/lib/api/reports';
import { describeError } from '@/lib/api/describe-error';
import { ReportTableCard, TOP_ROWS, topOfLabel } from './report-table-card';

interface FleetTelematicsTabProps {
  dateFrom: string;
  dateTo: string;
}

export function FleetTelematicsTab({ dateFrom, dateTo }: FleetTelematicsTabProps) {
  const params = {
    from: `${dateFrom}T00:00:00.000Z`,
    to: `${dateTo}T23:59:59.999Z`,
  };
  const { data, isLoading, isFetching, isError, error, refetch } = useFleetTelematicsReportQuery(params);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg bg-destructive/10 p-6 text-sm text-destructive">
        {describeError(error, 'Failed to load fleet telematics report')}
        <Button onClick={() => refetch()} variant="ghost" size="sm" className="ml-4">
          Retry
        </Button>
      </div>
    );
  }

  const { overview, utilization, driverBehavior, fuel } = data;
  /// Labels in sentence case to match the Overview tab's KPIs — this tab used
  /// Title Case, so the same screen named its figures two different ways
  /// depending on which tab you were on.
  const kpis: { label: string; value: string; icon: LucideIcon; warn?: boolean }[] = [
    { label: 'Distance (km)', value: overview.totalDistanceKm.toLocaleString(), icon: Route },
    { label: 'Trips', value: overview.totalTrips.toLocaleString(), icon: MapPin },
    { label: 'Utilization', value: `${overview.utilizationPct.toFixed(1)}%`, icon: Gauge },
    {
      label: 'Open alerts',
      value: String(overview.openAlerts),
      icon: AlertTriangle,
      warn: overview.openAlerts > 0,
    },
    { label: 'Harsh events', value: String(overview.harshEvents), icon: Activity },
    { label: 'Speeding events', value: String(overview.speedingEvents), icon: Gauge },
    { label: 'Est. fuel (L)', value: fuel.totalEstimatedFuelLiters.toLocaleString(), icon: Fuel },
    { label: 'Fleet L/100km', value: fuel.fleetLitersPer100Km.toFixed(1), icon: Fuel },
  ];

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Trip-based telematics aggregates for the selected date range. Live map tracking stays on Fleet Tracking.
      </p>
      {isFetching && !isLoading && <p className="text-xs text-muted-foreground">Refreshing for the new date range...</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <MetricCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            variant="compact"
            note={
              kpi.warn
                ? { icon: AlertTriangle, text: 'needs attention', tone: 'warning' }
                : undefined
            }
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SurfaceCard className="p-6">
          <h3 className="font-display text-lg font-bold text-foreground">Fleet state now</h3>
          <dl className="mt-4 space-y-2 text-sm">
            {(
              [
                ['Total vehicles', overview.fleet.totalVehicles],
                ['Moving', overview.fleet.moving],
                ['Idling', overview.fleet.idling],
                ['Stopped', overview.fleet.stopped],
                ['Offline', overview.fleet.offline],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </SurfaceCard>

        <ReportTableCard
          className="lg:col-span-2"
          title="Vehicle utilization"
          subtitle={topOfLabel(utilization.vehicles.length, 'vehicle')}
          isEmpty={utilization.vehicles.length === 0}
          emptyLabel="No trip data in this period — connect devices or widen the date range."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle</TableHead>
                <TableHead className="text-right">Trips</TableHead>
                <TableHead className="text-right">Distance km</TableHead>
                <TableHead className="text-right">Utilization</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {utilization.vehicles.slice(0, TOP_ROWS).map((v) => (
                <TableRow key={v.vehicleId}>
                  <TableCell className="font-medium text-foreground">
                    {v.plateNumber ?? v.vehicleCode ?? v.vehicleId}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{v.trips}</TableCell>
                  <TableCell className="text-right tabular-nums">{v.distanceKm.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{v.utilizationPct.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportTableCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ReportTableCard
          title="Driver safety scores"
          subtitle={topOfLabel(driverBehavior.drivers.length, 'driver')}
          isEmpty={driverBehavior.drivers.length === 0}
          emptyLabel="No driver trip data in this period"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead className="text-right">Trips</TableHead>
                <TableHead className="text-right">Speeding</TableHead>
                <TableHead className="text-right">Safety</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {driverBehavior.drivers.slice(0, TOP_ROWS).map((d) => (
                <TableRow key={d.driverId ?? d.employeeCode ?? d.name ?? 'unknown'}>
                  <TableCell className="font-medium text-foreground">
                    {d.name ?? d.employeeCode ?? 'Unknown'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{d.trips}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.speedingEvents}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{d.safetyScore.toFixed(0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportTableCard>

        <ReportTableCard
          title={`Fuel estimate${fuel.estimate ? ' (model)' : ''}`}
          subtitle={topOfLabel(fuel.vehicles.length, 'vehicle')}
          isEmpty={fuel.vehicles.length === 0}
          emptyLabel="No fuelable trip data in this period"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle</TableHead>
                <TableHead className="text-right">Distance km</TableHead>
                <TableHead className="text-right">Fuel L</TableHead>
                <TableHead className="text-right">L/100km</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fuel.vehicles.slice(0, TOP_ROWS).map((v) => (
                <TableRow key={v.vehicleId}>
                  <TableCell className="font-medium text-foreground">
                    {v.plateNumber ?? v.vehicleCode ?? v.vehicleId}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{v.distanceKm.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{v.estimatedFuelLiters.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{v.litersPer100Km.toFixed(1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportTableCard>
      </div>
    </div>
  );
}
