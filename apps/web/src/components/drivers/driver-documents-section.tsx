'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCurrentUser } from '@/lib/api/auth';
import {
  useDriverDocuments,
  DOC_TYPE_LABELS,
  type DriverDocumentRecord,
  type DocumentStatus,
} from '@/lib/api/driver-documents';
import { apiFetch } from '@/lib/api/fetch';
import { DriverDocumentSheet } from './driver-document-sheet';
import type { MembershipRole } from '@/lib/api/organizations';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  Download,
  Eye,
  FileText,
  MoreHorizontal,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_PILL: Record<DocumentStatus, { label: string; cls: string }> = {
  VALID: { label: 'Valid', cls: 'bg-success/15 text-success' },
  EXPIRING_SOON: { label: 'Expiring soon', cls: 'bg-warning/15 text-warning' },
  EXPIRED: { label: 'Expired', cls: 'bg-destructive/15 text-destructive' },
  MISSING: { label: 'Missing', cls: 'bg-destructive/15 text-destructive' },
  PENDING_REVIEW: { label: 'Pending review', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  REJECTED: { label: 'Rejected', cls: 'bg-destructive/15 text-destructive' },
  NOT_REQUIRED: { label: 'Not required', cls: 'bg-muted text-muted-foreground' },
};

function StatusPill({ status }: { status: DocumentStatus }) {
  const { label, cls } = STATUS_PILL[status];
  return (
    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', cls)}>
      {label}
    </span>
  );
}

// ─── Health summary ────────────────────────────────────────────────────────────

function HealthSummary({ items }: { items: DriverDocumentRecord[] }) {
  const valid = items.filter((d) => d.status === 'VALID').length;
  const expiring = items.filter((d) => d.status === 'EXPIRING_SOON').length;
  const expired = items.filter((d) => d.status === 'EXPIRED').length;
  const missing = items.filter((d) => d.status === 'MISSING').length;
  const pending = items.filter((d) => d.status === 'PENDING_REVIEW').length;
  const rejected = items.filter((d) => d.status === 'REJECTED').length;

  const parts: string[] = [];
  if (valid) parts.push(`${valid} valid`);
  if (expiring) parts.push(`${expiring} expiring`);
  if (expired) parts.push(`${expired} expired`);
  if (missing) parts.push(`${missing} missing`);
  if (pending) parts.push(`${pending} pending`);
  if (rejected) parts.push(`${rejected} rejected`);

  if (!parts.length) return null;

  const hasIssue = expired + missing + rejected > 0;
  const hasWarning = expiring + pending > 0;

  return (
    <p className={cn(
      'text-[11px]',
      hasIssue ? 'text-destructive' : hasWarning ? 'text-warning' : 'text-success',
    )}>
      {parts.join(' · ')}
    </p>
  );
}

// ─── Single document row ───────────────────────────────────────────────────────

interface RowProps {
  doc: DriverDocumentRecord;
  driverId: string;
  canVerify: boolean;
  onOpen: (doc: DriverDocumentRecord) => void;
}

function DocRow({ doc, driverId, canVerify: _canVerify, onOpen }: RowProps) {
  const isMissingOrNotRequired = doc.status === 'MISSING' || doc.status === 'NOT_REQUIRED';

  async function handleView() {
    if (!doc.id || !doc.hasFile) return;
    const res = await apiFetch(`/api/drivers/${driverId}/documents/${doc.id}/file`);
    if (!res.ok) { toast.error('Failed to load file'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function handleDownload() {
    if (!doc.id || !doc.hasFile || !doc.fileName) return;
    const res = await apiFetch(`/api/drivers/${driverId}/documents/${doc.id}/file`);
    if (!res.ok) { toast.error('Failed to download file'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 py-2.5 transition-colors',
        isMissingOrNotRequired && 'opacity-60',
      )}
    >
      {/* Icon */}
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/40">
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
      </span>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{DOC_TYPE_LABELS[doc.type]}</p>
        {doc.documentNumber && (
          <p className="font-mono text-[11px] text-muted-foreground">{doc.documentNumber}</p>
        )}
        {doc.expiryDate && (
          <p className={cn(
            'text-[11px]',
            doc.status === 'EXPIRED' ? 'text-destructive' :
            doc.status === 'EXPIRING_SOON' ? 'text-warning' :
            'text-muted-foreground',
          )}>
            Expires {formatDate(doc.expiryDate)}
          </p>
        )}
      </div>

      {/* Status pill */}
      <StatusPill status={doc.status} />

      {/* Quick view button */}
      {doc.hasFile && (
        <Button size="sm" variant="ghost" className="h-7 w-7 shrink-0 p-0" onClick={handleView} title="View file">
          <Eye className="h-3.5 w-3.5" />
        </Button>
      )}

      {/* Action menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 w-7 shrink-0 p-0">
            <MoreHorizontal className="h-3.5 w-3.5" />
            <span className="sr-only">More actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => onOpen(doc)}>
            <FileText className="mr-2 h-3.5 w-3.5" />
            {isMissingOrNotRequired ? 'Add document' : 'Edit / Manage'}
          </DropdownMenuItem>
          {doc.hasFile && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleView}>
                <Eye className="mr-2 h-3.5 w-3.5" />
                View file
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownload}>
                <Download className="mr-2 h-3.5 w-3.5" />
                Download
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─── Main section ──────────────────────────────────────────────────────────────

interface SectionProps {
  driverId: string;
}

export function DriverDocumentsSection({ driverId }: SectionProps) {
  const { data: currentUser } = useCurrentUser();
  const role = currentUser?.membership.role as MembershipRole | undefined;
  const canVerify = role === 'ADMIN' || role === 'OPERATIONS_MANAGER';

  const { items, loading, error } = useDriverDocuments(driverId);
  const [activeDoc, setActiveDoc] = useState<DriverDocumentRecord | null>(null);

  if (loading) {
    return (
      <div className="space-y-2 px-4 py-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-muted/40" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-3">
        <p className="text-xs text-destructive">{error}</p>
      </div>
    );
  }

  // Split: tracked types (MISSING/NOT_REQUIRED included via virtual entries) first, then OTHER
  const mainItems = items.filter((d) => d.type !== 'OTHER');
  const otherItems = items.filter((d) => d.type === 'OTHER');
  const existingOther = otherItems.find((d) => d.id !== null) ?? null;

  function handleOtherButtonClick() {
    if (existingOther) {
      setActiveDoc(existingOther);
      return;
    }
    const blankOther: DriverDocumentRecord = {
      id: null,
      organizationId: '',
      driverId,
      type: 'OTHER',
      status: 'MISSING',
      documentNumber: null,
      issueDate: null,
      expiryDate: null,
      fileName: null,
      hasFile: false,
      mimeType: null,
      fileSizeBytes: null,
      licenseClass: null,
      endorsements: null,
      uploadedByUserId: null,
      verifiedAt: null,
      verifiedByUserId: null,
      rejectedAt: null,
      rejectedByUserId: null,
      rejectionReason: null,
      notes: null,
      createdAt: null,
      updatedAt: null,
    };
    setActiveDoc(blankOther);
  }

  return (
    <>
      {/* Health summary */}
      <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 pb-2 pt-0">
        <HealthSummary items={items} />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleOtherButtonClick}
        >
          <Plus className="h-3 w-3" />
          {existingOther ? 'Edit other' : 'Add other'}
        </Button>
      </div>

      {/* Document rows */}
      <div className="divide-y divide-border/40 px-4">
        {mainItems.map((doc) => (
          <DocRow
            key={`${doc.type}-${doc.id ?? 'virtual'}`}
            doc={doc}
            driverId={driverId}
            canVerify={canVerify}
            onOpen={setActiveDoc}
          />
        ))}
        {otherItems.map((doc) => (
          <DocRow
            key={`other-${doc.id}`}
            doc={doc}
            driverId={driverId}
            canVerify={canVerify}
            onOpen={setActiveDoc}
          />
        ))}
      </div>

      {/* Document sheet */}
      {activeDoc && (
        <DriverDocumentSheet
          doc={activeDoc}
          driverId={driverId}
          open={Boolean(activeDoc)}
          onOpenChange={(o) => { if (!o) setActiveDoc(null); }}
        />
      )}
    </>
  );
}
