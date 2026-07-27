import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFleetTelematicsReportQuery } from '@/lib/api/reports';

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
        {error instanceof Error ? error.message : 'Failed to load fleet telematics report'}
        <Button onClick={() => refetch()} variant="ghost" size="sm" className="ml-4">
          Retry
        </Button>
      </div>
    );
  }

  const { overview, utilization, driverBehavior, fuel } = data;
  const kpis = [
    { label: 'Distance (km)', value: overview.totalDistanceKm.toLocaleString() },
    { label: 'Trips', value: overview.totalTrips.toLocaleString() },
    { label: 'Utilization', value: `${overview.utilizationPct.toFixed(1)}%` },
    { label: 'Open Alerts', value: String(overview.openAlerts), warn: overview.openAlerts > 0 },
    { label: 'Harsh Events', value: String(overview.harshEvents) },
    { label: 'Speeding Events', value: String(overview.speedingEvents) },
    { label: 'Est. Fuel (L)', value: fuel.totalEstimatedFuelLiters.toLocaleString() },
    { label: 'Fleet L/100km', value: fuel.fleetLitersPer100Km.toFixed(1) },
  ];

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Trip-based telematics aggregates for the selected date range. Live map tracking stays on Fleet Tracking.
      </p>
      {isFetching && !isLoading && <p className="text-xs text-muted-foreground">Refreshing for the new date range...</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{kpi.label}</div>
            <div className={`mt-3 font-display text-2xl font-bold ${kpi.warn ? 'text-destructive' : 'text-foreground'}`}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
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
        </div>

        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 lg:col-span-2">
          <div className="border-b border-brand/10 px-6 py-4">
            <h3 className="font-display text-lg font-bold text-foreground">Vehicle utilization</h3>
          </div>
          {utilization.vehicles.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No trip data in this period — connect devices or widen the date range.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand/10 bg-surface/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-6 py-3">Vehicle</th>
                    <th className="px-6 py-3 text-right">Trips</th>
                    <th className="px-6 py-3 text-right">Distance km</th>
                    <th className="px-6 py-3 text-right">Utilization</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand/10">
                  {utilization.vehicles.slice(0, 15).map((v) => (
                    <tr key={v.vehicleId}>
                      <td className="px-6 py-3 font-medium text-foreground">{v.plateNumber ?? v.vehicleCode ?? v.vehicleId}</td>
                      <td className="px-6 py-3 text-right">{v.trips}</td>
                      <td className="px-6 py-3 text-right">{v.distanceKm.toLocaleString()}</td>
                      <td className="px-6 py-3 text-right">{v.utilizationPct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50">
          <div className="border-b border-brand/10 px-6 py-4">
            <h3 className="font-display text-lg font-bold text-foreground">Driver safety scores</h3>
          </div>
          {driverBehavior.drivers.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">No driver trip data in this period</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand/10 bg-surface/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-6 py-3">Driver</th>
                    <th className="px-6 py-3 text-right">Trips</th>
                    <th className="px-6 py-3 text-right">Speeding</th>
                    <th className="px-6 py-3 text-right">Safety</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand/10">
                  {driverBehavior.drivers.slice(0, 15).map((d) => (
                    <tr key={d.driverId ?? d.employeeCode ?? d.name ?? 'unknown'}>
                      <td className="px-6 py-3 font-medium text-foreground">{d.name ?? d.employeeCode ?? 'Unknown'}</td>
                      <td className="px-6 py-3 text-right">{d.trips}</td>
                      <td className="px-6 py-3 text-right">{d.speedingEvents}</td>
                      <td className="px-6 py-3 text-right font-semibold">{d.safetyScore.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50">
          <div className="border-b border-brand/10 px-6 py-4">
            <h3 className="font-display text-lg font-bold text-foreground">
              Fuel estimate{fuel.estimate ? ' (model)' : ''}
            </h3>
          </div>
          {fuel.vehicles.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">No fuelable trip data in this period</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand/10 bg-surface/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-6 py-3">Vehicle</th>
                    <th className="px-6 py-3 text-right">Distance km</th>
                    <th className="px-6 py-3 text-right">Fuel L</th>
                    <th className="px-6 py-3 text-right">L/100km</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand/10">
                  {fuel.vehicles.slice(0, 15).map((v) => (
                    <tr key={v.vehicleId}>
                      <td className="px-6 py-3 font-medium text-foreground">{v.plateNumber ?? v.vehicleCode ?? v.vehicleId}</td>
                      <td className="px-6 py-3 text-right">{v.distanceKm.toLocaleString()}</td>
                      <td className="px-6 py-3 text-right">{v.estimatedFuelLiters.toLocaleString()}</td>
                      <td className="px-6 py-3 text-right">{v.litersPer100Km.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
