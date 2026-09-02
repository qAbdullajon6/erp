'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useCurrentUser } from '@/lib/api/auth';
import {
  useCreateDriverDocument,
  useUpdateDriverDocument,
  useUploadDriverDocumentFile,
  useRemoveDriverDocumentFile,
  useVerifyDriverDocument,
  useRejectDriverDocument,
  useRemoveDriverDocument,
  driverDocumentsAPI,
  DOC_TYPE_LABELS,
  type DriverDocumentRecord,
  type CreateDriverDocumentInput,
  type DriverDocumentType,
} from '@/lib/api/driver-documents';
import type { MembershipRole } from '@prisma/client';
import { apiFetch } from '@/lib/api/fetch';
import { describeError } from '@/lib/api/describe-error';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Loader2,
  Paperclip,
  ShieldCheck,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

const LICENSE_CLASS_LABELS: Record<string, string> = {
  CLASS_A: 'Class A — Motorcycles',
  CLASS_B: 'Class B — Cars & light trucks',
  CLASS_C: 'Class C — Medium trucks',
  CLASS_D: 'Class D — Passenger buses',
  CLASS_E: 'Class E — Trailers',
  CE: 'CE — HGV with trailer',
  OTHER: 'Other',
};

const STATUS_BADGE: Record<
  DriverDocumentRecord['status'],
  { label: string; cls: string }
> = {
  VALID: { label: 'Valid', cls: 'bg-success/15 text-success' },
  EXPIRING_SOON: { label: 'Expiring soon', cls: 'bg-warning/15 text-warning' },
  EXPIRED: { label: 'Expired', cls: 'bg-destructive/15 text-destructive' },
  MISSING: { label: 'Missing', cls: 'bg-destructive/15 text-destructive' },
  PENDING_REVIEW: { label: 'Pending review', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  REJECTED: { label: 'Rejected', cls: 'bg-destructive/15 text-destructive' },
  NOT_REQUIRED: { label: 'Not required', cls: 'bg-muted text-muted-foreground' },
};

interface Props {
  doc: DriverDocumentRecord;
  driverId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function DriverDocumentSheet({ doc, driverId, open, onOpenChange }: Props) {
  const { data: currentUser } = useCurrentUser();
  const role = currentUser?.membership.role as MembershipRole | undefined;
  const canVerify = role === 'ADMIN' || role === 'OPERATIONS_MANAGER';

  const isNew = doc.id === null;
  const isLicense = doc.type === 'DRIVER_LICENSE';

  const [docNumber, setDocNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [licenseClass, setLicenseClass] = useState('');
  const [endorsements, setEndorsements] = useState('');
  const [notes, setNotes] = useState('');

  const [fileStaging, setFileStaging] = useState<File | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const create = useCreateDriverDocument(driverId);
  const update = useUpdateDriverDocument(driverId);
  const uploadFile = useUploadDriverDocumentFile(driverId);
  const removeFile = useRemoveDriverDocumentFile(driverId);
  const verify = useVerifyDriverDocument(driverId);
  const reject = useRejectDriverDocument(driverId);
  const remove = useRemoveDriverDocument(driverId);

  // Sync form when doc changes
  useEffect(() => {
    setDocNumber(doc.documentNumber ?? '');
    setIssueDate(doc.issueDate ? doc.issueDate.split('T')[0] : '');
    setExpiryDate(doc.expiryDate ? doc.expiryDate.split('T')[0] : '');
    setLicenseClass(doc.licenseClass ?? '');
    setEndorsements(doc.endorsements ?? '');
    setNotes(doc.notes ?? '');
    setFileStaging(null);
    setShowRejectForm(false);
    setRejectReason('');
  }, [doc.id, doc.type, open]);

  async function handleSave() {
    setSaving(true);
    try {
      let savedId = doc.id;

      const meta = {
        documentNumber: docNumber.trim() || undefined,
        issueDate: issueDate || undefined,
        expiryDate: expiryDate || undefined,
        licenseClass: (licenseClass || undefined) as CreateDriverDocumentInput['licenseClass'],
        endorsements: endorsements.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      if (isNew) {
        const created = await create.mutate({ type: doc.type, ...meta });
        savedId = created.id;
        toast.success('Document record created');
      } else {
        await update.mutate({ docId: doc.id!, input: meta });
        toast.success('Document updated');
      }

      if (fileStaging && savedId) {
        await uploadFile.mutate({ docId: savedId!, file: fileStaging });
        toast.success('File uploaded');
      }

      onOpenChange(false);
    } catch (err) {
      toast.error(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleVerify() {
    if (!doc.id) return;
    try {
      await verify.mutate(doc.id);
      toast.success('Document verified');
      onOpenChange(false);
    } catch (err) {
      toast.error(describeError(err));
    }
  }

  async function handleReject() {
    if (!doc.id || !rejectReason.trim()) return;
    try {
      await reject.mutate({ docId: doc.id, reason: rejectReason.trim() });
      toast.success('Document rejected');
      onOpenChange(false);
    } catch (err) {
      toast.error(describeError(err));
    }
  }

  async function handleRemoveFile() {
    if (!doc.id) return;
    try {
      await removeFile.mutate(doc.id);
      toast.success('File removed');
    } catch (err) {
      toast.error(describeError(err));
    }
  }

  async function handleRemoveDoc() {
    if (!doc.id) return;
    try {
      await remove.mutate(doc.id);
      toast.success('Document removed');
      setShowRemoveConfirm(false);
      onOpenChange(false);
    } catch (err) {
      toast.error(describeError(err));
    }
  }

  async function handleViewFile() {
    if (!doc.id) return;
    const res = await apiFetch(`/api/drivers/${driverId}/documents/${doc.id}/file`);
    if (!res.ok) { toast.error('Failed to load file'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function handleDownloadFile() {
    if (!doc.id || !doc.fileName) return;
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

  const statusCfg = STATUS_BADGE[doc.status];

  const hasActualFile = doc.hasFile && !fileStaging;
  const hasStagedFile = Boolean(fileStaging);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex w-[420px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[420px]">
          <SheetHeader className="border-b border-border/50 px-6 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <SheetTitle className="text-base">{DOC_TYPE_LABELS[doc.type]}</SheetTitle>
                <SheetDescription className="mt-0.5 text-xs">
                  {isNew ? 'Create document record' : 'Edit document metadata and file'}
                </SheetDescription>
              </div>
              <span className={cn('mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', statusCfg.cls)}>
                {statusCfg.label}
              </span>
            </div>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {/* Metadata fields */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Document Info</p>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">Document number</label>
                  <Input
                    value={docNumber}
                    onChange={(e) => setDocNumber(e.target.value)}
                    placeholder="e.g. UZ-DL-123456"
                    className="h-9 font-mono"
                    maxLength={100}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">Issue date</label>
                    <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="h-9" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">Expiry date</label>
                    <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="h-9" />
                  </div>
                </div>
                {isLicense && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-foreground">License class</label>
                      <Select value={licenseClass} onValueChange={(v) => setLicenseClass(v === '__none__' ? '' : v)}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Select class" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— None —</SelectItem>
                          {Object.entries(LICENSE_CLASS_LABELS).map(([val, label]) => (
                            <SelectItem key={val} value={val}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-foreground">Endorsements / restrictions</label>
                      <Input
                        value={endorsements}
                        onChange={(e) => setEndorsements(e.target.value)}
                        placeholder="e.g. Hazmat, No night driving"
                        className="h-9"
                        maxLength={300}
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">Notes</label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Internal notes about this document"
                    className="h-20 resize-none"
                    maxLength={500}
                  />
                </div>
              </div>
            </div>

            {/* File section — only when doc record exists or staging a new one */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">File</p>

              {hasStagedFile && (
                <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-xs">{fileStaging!.name}</span>
                  <button onClick={() => setFileStaging(null)} className="shrink-0 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {hasActualFile && (
                <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-xs">{doc.fileName}</span>
                  {doc.fileSizeBytes && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {(doc.fileSizeBytes / 1024).toFixed(0)} KB
                    </span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="mr-1.5 h-3 w-3" />
                  {hasActualFile ? 'Replace file' : 'Upload file'}
                </Button>
                {hasActualFile && !isNew && (
                  <>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleViewFile}>
                      <Eye className="mr-1.5 h-3 w-3" />
                      View
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleDownloadFile}>
                      <Download className="mr-1.5 h-3 w-3" />
                      Download
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs text-destructive hover:text-destructive"
                      onClick={handleRemoveFile}
                    >
                      <Trash2 className="mr-1.5 h-3 w-3" />
                      Remove file
                    </Button>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setFileStaging(f);
                  e.target.value = '';
                }}
              />
              <p className="text-[10px] text-muted-foreground">PDF, JPEG, PNG, WebP, Word — max 10 MB</p>
            </div>

            {/* Verification — only for existing docs that are PENDING_REVIEW */}
            {!isNew && canVerify && doc.status === 'PENDING_REVIEW' && (
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
                <p className="text-xs font-semibold text-foreground">Verification</p>
                <p className="text-xs text-muted-foreground">
                  This document is pending review. Verify it to mark as valid, or reject with a reason.
                </p>
                {!showRejectForm ? (
                  <div className="flex gap-2">
                    <Button size="sm" className="h-8 text-xs bg-success hover:bg-success/90 text-white" onClick={handleVerify}>
                      <CheckCircle2 className="mr-1.5 h-3 w-3" />
                      Verify
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => setShowRejectForm(true)}>
                      <XCircle className="mr-1.5 h-3 w-3" />
                      Reject
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Reason for rejection (required)"
                      className="h-20 resize-none text-xs"
                      maxLength={500}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 text-xs"
                        disabled={!rejectReason.trim()}
                        onClick={handleReject}
                      >
                        Confirm rejection
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setShowRejectForm(false); setRejectReason(''); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Rejection reason display */}
            {doc.status === 'REJECTED' && doc.rejectionReason && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  <div>
                    <p className="text-xs font-semibold text-destructive">Rejected</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{doc.rejectionReason}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Verified info */}
            {doc.status === 'VALID' && doc.verifiedAt && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                Verified {formatDate(doc.verifiedAt)}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border/50 px-6 py-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="h-9"
                >
                  {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {isNew ? 'Create' : 'Save changes'}
                </Button>
                <Button size="sm" variant="outline" className="h-9" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
              </div>
              {!isNew && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 text-destructive hover:text-destructive"
                  onClick={() => setShowRemoveConfirm(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the {DOC_TYPE_LABELS[doc.type]} record and any uploaded file. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRemoveDoc}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
