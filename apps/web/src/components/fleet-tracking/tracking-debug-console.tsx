'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Download, RefreshCw, Activity, Radio, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  trackingDebugAPI,
  useTrackingDebugSnapshotQuery,
  type TrackingDebugDiagnostic,
  type TrackingDebugEvent,
  type TrackingDebugPacket,
} from '@/lib/api/tracking-debug';
import { EmptyState, ErrorState } from '@/components/shared/list-states';
import { describeError } from '@/lib/api/describe-error';
import { Skeleton } from '@/components/ui/skeleton';

type TabId = 'sessions' | 'packets' | 'timeline' | 'diagnostics' | 'metrics';

const TABS: { id: TabId; label: string }[] = [
  { id: 'sessions', label: 'Sessions' },
  { id: 'packets', label: 'Packet inspector' },
  { id: 'timeline', label: 'Event timeline' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'metrics', label: 'Metrics' },
];

function fmtMs(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

function fmtAge(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '—';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h`;
}

function severityClass(severity: TrackingDebugDiagnostic['severity']): string {
  switch (severity) {
    case 'critical':
      return 'border-destructive/40 bg-destructive/10 text-destructive';
    case 'warning':
      return 'border-warning/40 bg-warning/10 text-warning';
    default:
      return 'border-border bg-muted/40 text-muted-foreground';
  }
}

function outcomeClass(outcome: TrackingDebugPacket['outcome']): string {
  return outcome === 'accepted'
    ? 'bg-success/15 text-success'
    : 'bg-destructive/15 text-destructive';
}

function eventKindLabel(kind: string): string {
  switch (kind) {
    case 'driver_login':
      return 'Driver Login';
    case 'dispatch_assigned':
      return 'Dispatch Assigned';
    case 'session_created':
      return 'Tracking Session Created';
    case 'gps_received':
      return 'GPS Received';
    case 'vehicle_updated':
      return 'Vehicle Updated';
    case 'replay_saved':
      return 'Replay Saved';
    case 'sse_broadcast':
      return 'SSE Broadcast';
    case 'heartbeat':
      return 'Heartbeat';
    case 'dispatch_finished':
      return 'Dispatch Finished';
    case 'session_closed':
      return 'Tracking Closed';
    default:
      return kind;
  }
}

export function TrackingDebugConsole() {
  const query = useTrackingDebugSnapshotQuery(true);
  const [tab, setTab] = useState<TabId>('sessions');
  const [selectedPacketId, setSelectedPacketId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const snapshot = query.data;
  const selectedPacket = useMemo(() => {
    if (!snapshot || !selectedPacketId) return snapshot?.packets[0] ?? null;
    return snapshot.packets.find((p) => p.id === selectedPacketId) ?? snapshot.packets[0] ?? null;
  }, [snapshot, selectedPacketId]);

  async function handleExport() {
    setExporting(true);
    try {
      const data = await trackingDebugAPI.exportJson();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tracking-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  if (query.isLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-6">
        <ErrorState
          message={describeError(query.error, 'Tracking debug unavailable')}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="p-6">
        <EmptyState
          title="No debug data yet"
          description="Send GPS from the Driver app or /tracking/dev simulate endpoints, then refresh."
        />
      </div>
    );
  }

  const { metrics, sessions, packets, timeline, diagnostics, sse, trips, vehicleStates } =
    snapshot;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tracking Debug Console</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Development observability for Driver Mobile GPS — live sessions, packets, timeline,
            and diagnostics from the real backend only.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Generated {new Date(snapshot.generatedAt).toLocaleString()} · offline threshold{' '}
            {snapshot.offlineThresholdSec}s · auto-refresh 5s
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={cn('size-3.5', query.isFetching && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void handleExport()}
            disabled={exporting}
          >
            <Download className="size-3.5" />
            Export JSON
          </Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <MetricCard
          icon={<Radio className="size-3.5" />}
          label="Active sessions"
          value={String(metrics.activeSessions)}
        />
        <MetricCard
          icon={<Activity className="size-3.5" />}
          label="Connected drivers"
          value={String(metrics.connectedDriversEstimate)}
        />
        <MetricCard label="SSE clients (org)" value={String(metrics.sseClientsOrg)} />
        <MetricCard label="GPS packets/min" value={metrics.packetsPerMinute.toFixed(1)} />
        <MetricCard label="Avg process latency" value={fmtMs(metrics.avgProcessingLatencyMs)} />
        <MetricCard label="Avg GPS interval" value={fmtMs(metrics.avgGpsIntervalMs)} />
      </section>

      <div className="flex flex-wrap gap-1 border-b border-border/60 pb-px">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-t-md px-3 py-1.5 text-sm transition-colors',
              tab === t.id
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {t.id === 'diagnostics' && diagnostics.length > 0 ? (
              <Badge variant="secondary" className="ml-1.5">
                {diagnostics.length}
              </Badge>
            ) : null}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'sessions' ? (
          <SessionsPanel
            sessions={sessions}
            vehicleStates={vehicleStates}
            trips={trips}
            sse={sse}
          />
        ) : null}
        {tab === 'packets' ? (
          <PacketsPanel
            packets={packets}
            selected={selectedPacket}
            onSelect={setSelectedPacketId}
          />
        ) : null}
        {tab === 'timeline' ? <TimelinePanel events={timeline} /> : null}
        {tab === 'diagnostics' ? <DiagnosticsPanel items={diagnostics} /> : null}
        {tab === 'metrics' ? <MetricsPanel metrics={metrics} /> : null}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function SessionsPanel({
  sessions,
  vehicleStates,
  trips,
  sse,
}: {
  sessions: NonNullable<ReturnType<typeof useTrackingDebugSnapshotQuery>['data']>['sessions'];
  vehicleStates: NonNullable<
    ReturnType<typeof useTrackingDebugSnapshotQuery>['data']
  >['vehicleStates'];
  trips: NonNullable<ReturnType<typeof useTrackingDebugSnapshotQuery>['data']>['trips'];
  sse: NonNullable<ReturnType<typeof useTrackingDebugSnapshotQuery>['data']>['sse'];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Live Tracking Sessions">
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ACTIVE TrackingSession rows.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/50">
                  <th className="py-1.5 pr-2 font-medium">Source</th>
                  <th className="py-1.5 pr-2 font-medium">Vehicle</th>
                  <th className="py-1.5 pr-2 font-medium">Heartbeat</th>
                  <th className="py-1.5 pr-2 font-medium">GPS age</th>
                  <th className="py-1.5 pr-2 font-medium">Movement</th>
                  <th className="py-1.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-border/30">
                    <td className="py-1.5 pr-2 font-mono">{s.source}</td>
                    <td className="py-1.5 pr-2 font-mono">{s.vehicleId?.slice(0, 8) ?? '—'}</td>
                    <td className="py-1.5 pr-2 tabular-nums">
                      {fmtAge(s.heartbeatAgeSec)}
                      {s.heartbeatMissing ? (
                        <span className="ml-1 text-destructive">missing</span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums">{fmtAge(s.gpsAgeSec)}</td>
                    <td className="py-1.5 pr-2">{s.movementState ?? '—'}</td>
                    <td className="py-1.5">{s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="VehicleTelematicsState">
        {vehicleStates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No live vehicle state rows.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/50">
                  <th className="py-1.5 pr-2 font-medium">Vehicle</th>
                  <th className="py-1.5 pr-2 font-medium">Coords</th>
                  <th className="py-1.5 pr-2 font-medium">Speed</th>
                  <th className="py-1.5 pr-2 font-medium">State</th>
                  <th className="py-1.5 font-medium">Last packet</th>
                </tr>
              </thead>
              <tbody>
                {vehicleStates.slice(0, 50).map((s) => (
                  <tr key={s.vehicleId} className="border-b border-border/30">
                    <td className="py-1.5 pr-2 font-mono">{s.vehicleId.slice(0, 8)}</td>
                    <td className="py-1.5 pr-2 tabular-nums">
                      {s.latitude != null && s.longitude != null
                        ? `${s.latitude.toFixed(5)}, ${s.longitude.toFixed(5)}`
                        : '—'}
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums">
                      {s.speedKph != null ? `${s.speedKph.toFixed(1)}` : '—'}
                    </td>
                    <td className="py-1.5 pr-2">
                      {s.movementState}
                      {s.isStale ? <span className="ml-1 text-destructive">stale</span> : null}
                    </td>
                    <td className="py-1.5 text-muted-foreground">
                      {s.lastReceivedAt ? new Date(s.lastReceivedAt).toLocaleTimeString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Active trips / replay">
        {trips.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ACTIVE trips.</p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {trips.map((t) => (
              <li key={t.id} className="flex justify-between gap-2 border-b border-border/30 py-1">
                <span className="font-mono">{t.id.slice(0, 8)}</span>
                <span>
                  {t.pointCount} pts · vehicle {t.vehicleId.slice(0, 8)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="SSE clients (this process)">
        <p className="mb-2 text-xs text-muted-foreground">
          Org {sse.clientsOrg} / global {sse.clientsGlobal}
        </p>
        {sse.clients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No SSE clients connected on this instance.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {sse.clients.map((c, i) => (
              <li key={`${c.organizationId}-${i}`}>
                Client #{i + 1}
                {c.vehicleFilterCount != null
                  ? ` · vehicle filter ${c.vehicleFilterCount}`
                  : ' · all vehicles'}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function PacketsPanel({
  packets,
  selected,
  onSelect,
}: {
  packets: TrackingDebugPacket[];
  selected: TrackingDebugPacket | null;
  onSelect: (id: string) => void;
}) {
  if (packets.length === 0) {
    return (
      <EmptyState
        title="No packets in buffer"
        description="Incoming GPS from /tracking/my-location, device ingest, or simulate tools appear here."
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 font-medium">Received</th>
              <th className="px-2 py-1.5 font-medium">Device</th>
              <th className="px-2 py-1.5 font-medium">Outcome</th>
              <th className="px-2 py-1.5 font-medium">Reason</th>
              <th className="px-2 py-1.5 font-medium">Latency</th>
              <th className="px-2 py-1.5 font-medium">Coords</th>
            </tr>
          </thead>
          <tbody>
            {packets.map((p) => (
              <tr
                key={p.id}
                className={cn(
                  'cursor-pointer border-t border-border/40 hover:bg-muted/30',
                  selected?.id === p.id && 'bg-muted/50',
                )}
                onClick={() => onSelect(p.id)}
              >
                <td className="px-2 py-1.5 tabular-nums">
                  {new Date(p.receivedAt).toLocaleTimeString()}
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {p.deviceAt ? new Date(p.deviceAt).toLocaleTimeString() : '—'}
                </td>
                <td className="px-2 py-1.5">
                  <span className={cn('rounded px-1.5 py-0.5', outcomeClass(p.outcome))}>
                    {p.outcome}
                  </span>
                </td>
                <td className="px-2 py-1.5 font-mono text-[11px]">{p.reason ?? '—'}</td>
                <td className="px-2 py-1.5 tabular-nums">{fmtMs(p.processingDurationMs)}</td>
                <td className="px-2 py-1.5 tabular-nums">
                  {p.latitude != null && p.longitude != null
                    ? `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="rounded-lg border border-border/60 bg-card p-3 text-xs">
          <h3 className="mb-2 text-sm font-medium">Packet detail</h3>
          <dl className="space-y-1.5">
            <Detail label="Received" value={new Date(selected.receivedAt).toISOString()} />
            <Detail
              label="Device time"
              value={selected.deviceAt ? new Date(selected.deviceAt).toISOString() : '—'}
            />
            <Detail
              label="Coordinates"
              value={
                selected.latitude != null && selected.longitude != null
                  ? `${selected.latitude}, ${selected.longitude}`
                  : '—'
              }
            />
            <Detail
              label="Speed / heading"
              value={`${selected.speedKph ?? '—'} kph · ${selected.heading ?? '—'}°`}
            />
            <Detail label="Accuracy" value={selected.accuracyM != null ? `${selected.accuracyM} m` : '—'} />
            <Detail label="Processing" value={fmtMs(selected.processingDurationMs)} />
            <Detail label="SSE broadcast" value={fmtMs(selected.sseBroadcastDurationMs)} />
            <Detail label="Replay write" value={fmtMs(selected.replayWriteDurationMs)} />
            <Detail label="Validation" value={selected.outcome === 'accepted' ? 'passed' : 'failed'} />
            <Detail label="Outcome" value={selected.outcome} />
            <Detail label="Reason" value={selected.reason ?? '—'} />
            <Detail label="Source" value={selected.source} />
            <Detail label="Vehicle" value={selected.vehicleId ?? '—'} />
            <Detail label="Trip" value={selected.tripId ?? '—'} />
          </dl>
        </div>
      ) : null}
    </div>
  );
}

function TimelinePanel({ events }: { events: TrackingDebugEvent[] }) {
  if (events.length === 0) {
    return (
      <EmptyState
        title="Timeline empty"
        description="Lifecycle events appear as sessions open, GPS arrives, and dispatches finish."
      />
    );
  }

  return (
    <ol className="relative space-y-0 border-l border-border/60 ml-3">
      {events.map((e) => (
        <li key={e.id} className="relative pb-4 pl-4">
          <span className="absolute -left-1.5 top-1.5 size-3 rounded-full border border-border bg-background" />
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {new Date(e.at).toLocaleString()}
          </div>
          <div className="text-sm font-medium">{eventKindLabel(e.kind)}</div>
          <div className="text-xs text-muted-foreground">{e.message}</div>
          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            {[e.vehicleId && `veh ${e.vehicleId.slice(0, 8)}`, e.sessionId && `sess ${e.sessionId.slice(0, 8)}`, e.dispatchId && `dsp ${e.dispatchId.slice(0, 8)}`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </li>
      ))}
    </ol>
  );
}

function DiagnosticsPanel({ items }: { items: TrackingDebugDiagnostic[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No diagnostics"
        description="Duplicate, late, future, offline, and conflict conditions will surface here when observed."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((d) => (
        <li
          key={d.code}
          className={cn('rounded-lg border px-3 py-2.5 text-sm', severityClass(d.severity))}
        >
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-3.5" />
            {d.code.replace(/_/g, ' ')}
            <Badge variant="outline" className="ml-auto">
              {d.count}
            </Badge>
          </div>
          <p className="mt-1 text-xs opacity-90">{d.message}</p>
        </li>
      ))}
    </ul>
  );
}

function MetricsPanel({
  metrics,
}: {
  metrics: NonNullable<ReturnType<typeof useTrackingDebugSnapshotQuery>['data']>['metrics'];
}) {
  const rows: Array<[string, string]> = [
    ['Window started', new Date(metrics.windowStartedAt).toLocaleString()],
    ['Packets (buffer)', String(metrics.packetsTotal)],
    ['Accepted', String(metrics.packetsAccepted)],
    ['Rejected', String(metrics.packetsRejected)],
    ['Packets / min', metrics.packetsPerMinute.toFixed(2)],
    ['Avg GPS interval', fmtMs(metrics.avgGpsIntervalMs)],
    ['Avg processing latency', fmtMs(metrics.avgProcessingLatencyMs)],
    ['Avg SSE broadcast latency', fmtMs(metrics.avgSseBroadcastLatencyMs)],
    ['Avg replay write latency', fmtMs(metrics.avgReplayWriteLatencyMs)],
    ['Connected drivers (estimate)', String(metrics.connectedDriversEstimate)],
    ['Active sessions', String(metrics.activeSessions)],
    ['SSE clients (org)', String(metrics.sseClientsOrg)],
    ['SSE clients (global process)', String(metrics.sseClientsGlobal)],
  ];

  return (
    <dl className="grid max-w-xl gap-2 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-border/60 px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 text-sm font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border/60 bg-card p-3">
      <h2 className="mb-2 text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-mono break-all">{value}</dd>
    </div>
  );
}
