'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { TelematicsProviderType } from '@/lib/api/telematics-devices';
import { providerLabel } from '@/components/fleet-devices/devices-ops';
import {
  buildIngestUrlHelper,
  isTraccarProvider,
  publicApiOriginStatusMessage,
} from '@/components/fleet-devices/gateway-setup-helpers';
import {
  type GpsConnectionStatus,
  gpsConnectionStatusClass,
  gpsConnectionStatusLabel,
} from '@/components/fleet-devices/gps-connection-status';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Check, Copy, Radio } from 'lucide-react';

type ChecklistMode = 'onboarding' | 'detail';

interface Props {
  deviceId: string;
  provider: TelematicsProviderType;
  imei: string;
  vehicleLabel?: string | null;
  connectionStatus: GpsConnectionStatus;
  isSuccessfullyConnected: boolean;
  /// One-time plaintext secret — onboarding Gateway step only. Never pass from detail.
  ingestSecret?: string | null;
  secretPrefix?: string | null;
  mode: ChecklistMode;
  onVerify?: () => void;
  onReviewSetup?: () => void;
  className?: string;
}

async function copyText(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
    return true;
  } catch {
    toast.error(`Could not copy ${label.toLowerCase()}`);
    return false;
  }
}

function StepMark({
  state,
}: {
  state: 'done' | 'current' | 'manual' | 'pending';
}) {
  if (state === 'done') {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
        <Check className="h-3 w-3" aria-hidden />
      </span>
    );
  }
  if (state === 'current') {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
        <Radio className="h-3 w-3" aria-hidden />
      </span>
    );
  }
  if (state === 'manual') {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted-foreground">
        …
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-[10px] text-muted-foreground">
      ○
    </span>
  );
}

export function GatewaySetupChecklist({
  deviceId,
  provider,
  imei,
  vehicleLabel,
  connectionStatus,
  isSuccessfullyConnected,
  ingestSecret,
  secretPrefix,
  mode,
  onVerify,
  onReviewSetup,
  className,
}: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const urls = buildIngestUrlHelper({
    deviceId,
    ingestSecret: mode === 'onboarding' ? ingestSecret : null,
  });
  const traccar = isTraccarProvider(provider);

  const telemetryDone = isSuccessfullyConnected;
  const waiting =
    connectionStatus === 'WAITING_FOR_CONNECTION' ||
    connectionStatus === 'STALE';

  const markCopied = (key: string) => {
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 2000);
  };

  const displayUrl =
    mode === 'onboarding' && urls.oneTimeUrl
      ? urls.oneTimeUrl
      : urls.urlTemplate;
  const canCopyFullUrl = Boolean(displayUrl);

  return (
    <div
      className={cn('space-y-4', className)}
      data-testid="gateway-setup-checklist"
      data-mode={mode}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold',
            gpsConnectionStatusClass(connectionStatus),
          )}
        >
          {gpsConnectionStatusLabel(connectionStatus)}
        </span>
        <span className="text-xs text-muted-foreground">
          Registered ≠ connected
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        FlowERP registered this GPS → you configure the gateway → the unit sends data →
        FlowERP verifies → the truck appears on the map.
      </p>

      <ol className="space-y-3">
        <li className="flex gap-2.5">
          <StepMark state="done" />
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-foreground">1. GPS device registered in FlowERP</p>
            <p className="text-xs text-muted-foreground">
              The device is registered, but it is not connected yet.
            </p>
          </div>
        </li>

        <li className="flex gap-2.5">
          <StepMark state="manual" />
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              2. Configure your {traccar ? 'Traccar gateway' : 'GPS gateway'}
            </p>
            <p className="text-xs text-muted-foreground">
              Manual setup required — FlowERP does not configure the gateway automatically. Forward
              this device’s telemetry to FlowERP using the ingest URL below.
            </p>
          </div>
        </li>

        <li className="flex gap-2.5">
          <StepMark state="manual" />
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-foreground">3. Configure the GPS device</p>
            <p className="text-xs text-muted-foreground">
              Manual setup required — the physical tracker must send data to your gateway/server
              (protocol and server address are outside FlowERP).
            </p>
          </div>
        </li>

        <li className="flex gap-2.5">
          <StepMark state={telemetryDone ? 'done' : waiting ? 'current' : 'pending'} />
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-foreground">4. Wait for real telemetry</p>
            <p className="text-xs text-muted-foreground">
              {telemetryDone
                ? 'FlowERP has received real telemetry for this device.'
                : 'The connection is confirmed only after FlowERP receives real telemetry.'}
            </p>
          </div>
        </li>

        <li className="flex gap-2.5">
          <StepMark state={telemetryDone ? 'done' : 'pending'} />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-foreground">5. Verify connection</p>
            <p className="text-xs text-muted-foreground">
              Check live status from real GPS data — never from registration alone.
            </p>
            {onVerify ? (
              <Button type="button" size="sm" className="mt-1" onClick={onVerify}>
                Verify connection
              </Button>
            ) : null}
          </div>
        </li>
      </ol>

      <div className="space-y-2 rounded-md border border-border/60 bg-muted/15 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Device reference
        </p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Provider</dt>
            <dd className="font-medium text-foreground">{providerLabel(provider)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Connected vehicle</dt>
            <dd className="font-medium text-foreground">{vehicleLabel || 'Not attached'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">IMEI</dt>
            <dd className="mt-0.5 flex flex-wrap items-center gap-2">
              <code className="break-all font-mono text-xs text-foreground">{imei}</code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => void copyText('IMEI', imei).then((ok) => ok && markCopied('imei'))}
              >
                {copiedKey === 'imei' ? (
                  <>
                    <Check className="mr-1 h-3 w-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-3 w-3" />
                    Copy IMEI
                  </>
                )}
              </Button>
            </dd>
          </div>
        </dl>
      </div>

      <div className="space-y-2 rounded-md border border-border/60 bg-muted/15 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          FlowERP ingest URL
        </p>
        {urls.configurationMissing || !displayUrl ? (
          <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <p className="font-medium">Public API URL not ready</p>
            <p className="text-destructive/90">
              {publicApiOriginStatusMessage(urls.originStatus) ||
                'Set VITE_API_PUBLIC_URL to an Internet-reachable API origin before copying a gateway URL.'}
            </p>
            <p className="text-muted-foreground">
              Path template (host required separately):{' '}
              <code className="break-all font-mono text-[11px] text-foreground">
                {urls.pathTemplate}
              </code>
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Point your Traccar / gateway position forwarder at this Internet-reachable URL.
              Do not use localhost or Docker-only hostnames here.
            </p>
            <div className="rounded-md border border-border bg-background/60 p-2.5">
              <code className="break-all font-mono text-[11px] leading-relaxed text-foreground">
                {displayUrl}
              </code>
            </div>
          </>
        )}
        {mode === 'detail' ? (
          <p className="text-xs text-muted-foreground">
            Connection secret: not shown on this page. Paste the secret saved at registration
            (or rotate a new one if it was lost) into the URL’s{' '}
            <span className="font-mono text-foreground">secret=</span> parameter.
          </p>
        ) : null}
        {mode === 'onboarding' && secretPrefix ? (
          <p className="text-xs text-muted-foreground">
            Connection secret prefix{' '}
            <span className="font-mono text-foreground">{secretPrefix}</span>
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canCopyFullUrl || !displayUrl}
            onClick={() =>
              void copyText('Ingest URL', displayUrl!).then((ok) => ok && markCopied('url'))
            }
          >
            {copiedKey === 'url' ? (
              <>
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copy ingest URL
              </>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              void copyText('Ingest path', urls.pathTemplate).then(
                (ok) => ok && markCopied('path'),
              )
            }
          >
            {copiedKey === 'path' ? 'Copied path' : 'Copy path only'}
          </Button>
        </div>
      </div>

      {traccar ? (
        <div className="space-y-2 rounded-md border border-border p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Traccar setup</p>
          <ol className="list-decimal space-y-1 pl-4 text-xs">
            <li>
              Register this IMEI in Traccar:{' '}
              <span className="font-mono text-foreground">{imei}</span>
            </li>
            <li>Configure Traccar to forward this device’s telemetry to the FlowERP ingest URL.</li>
            <li>Ensure the physical GPS tracker is configured for your Traccar server/protocol.</li>
            <li>Wait for the device to send data.</li>
            <li>Return here and click Verify connection.</li>
          </ol>
          <p className="text-xs">FlowERP does not configure Traccar or the hardware for you.</p>
        </div>
      ) : (
        <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
          End-to-end hardware setup for {providerLabel(provider)} is not fully guided yet. Forward
          positions to FlowERP with the ingest URL and connection secret, then verify.
        </div>
      )}

      {!telemetryDone && waiting ? (
        <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
          <p className="font-medium text-foreground">Waiting for GPS data</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The device is registered, but FlowERP has not received recent telemetry yet.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {onVerify ? (
              <Button type="button" size="sm" onClick={onVerify}>
                Verify connection
              </Button>
            ) : null}
            {onReviewSetup ? (
              <Button type="button" size="sm" variant="outline" onClick={onReviewSetup}>
                Review gateway setup
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {telemetryDone ? (
        <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">
          <p className="font-medium">GPS connected</p>
          <p className="mt-1 text-xs opacity-90">
            Real telemetry confirmed. Open Fleet Tracking to see the vehicle on the map.
          </p>
        </div>
      ) : null}
    </div>
  );
}
