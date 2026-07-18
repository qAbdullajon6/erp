"use client";

import type { AuditLogEntry } from "@/lib/api/audit-logs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface AuditLogDetailProps {
  entry: AuditLogEntry;
  onClose: () => void;
}

function formatAction(action: string): string {
  return action
    .replace(/\./g, " ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatMetadata(metadata: Record<string, unknown> | null): string {
  if (!metadata) return "None";
  const cleaned = { ...metadata };
  // Remove sensitive fields
  delete cleaned.password;
  delete cleaned.passwordHash;
  delete cleaned.accessToken;
  delete cleaned.refreshToken;
  return JSON.stringify(cleaned, null, 2);
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-4 border-b border-brand/10 py-3 last:border-b-0">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function AuditLogDetail({ entry, onClose }: AuditLogDetailProps) {
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Audit Entry</DialogTitle>
          <DialogDescription>{formatAction(entry.action)}</DialogDescription>
        </DialogHeader>

        <dl>
          <DetailRow label="Timestamp">{formatTimestamp(entry.createdAt)}</DetailRow>
          <DetailRow label="Action">
            <span className="inline-flex items-center rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand">
              {entry.action}
            </span>
          </DetailRow>
          <DetailRow label="Actor">
            {entry.actor
              ? `${entry.actor.firstName} ${entry.actor.lastName} (${entry.actor.email})`
              : "System"}
          </DetailRow>
          <DetailRow label="Entity Type">{entry.entityType}</DetailRow>
          <DetailRow label="Entity ID">
            <span className="font-mono text-xs">{entry.entityId || "—"}</span>
          </DetailRow>
          <DetailRow label="Organization ID">
            <span className="font-mono text-xs">{entry.organizationId || "—"}</span>
          </DetailRow>
          <DetailRow label="Actor ID">
            <span className="font-mono text-xs">{entry.actorUserId || "—"}</span>
          </DetailRow>

          {/* Metadata */}
          <div className="mt-4">
            <dt className="mb-2 text-sm font-medium text-muted-foreground">Metadata</dt>
            <dd className="overflow-x-auto rounded-lg border border-brand/10 bg-surface/50 p-4">
              <pre className="whitespace-pre-wrap font-mono text-xs text-foreground">
                {formatMetadata(entry.metadata)}
              </pre>
            </dd>
          </div>
        </dl>
      </DialogContent>
    </Dialog>
  );
}
