'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useOrderDocuments,
  useUploadOrderDocument,
  useDeleteOrderDocument,
  useRenameOrderDocument,
  ordersAPI,
  type OrderDocument,
  type OrderDocumentKind,
} from '@/lib/api/orders';
import type { Invoice } from '@/lib/api/invoices';
import { useInvoiceQuery } from '@/lib/api/invoices';
import { useCurrentUser } from '@/lib/api/auth';
import { useOrganizationQuery } from '@/lib/api/organizations';
import { InvoiceDetailSheet } from '@/components/finance/invoice-detail-sheet';
import { printInvoiceDocument } from '@/components/finance/invoice-print';
import { downloadBlob } from '@/lib/api/imports';
import { formatDateTime, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  Download,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Paperclip,
  Printer,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentRow({
  doc,
  orderId,
  canWrite,
  onPreview,
  onDeleted,
}: {
  doc: OrderDocument;
  orderId: string;
  canWrite: boolean;
  onPreview: (doc: OrderDocument) => void;
  onDeleted?: (documentId: string) => void;
}) {
  const { remove, loading } = useDeleteOrderDocument(orderId);
  const { rename, loading: renaming } = useRenameOrderDocument(orderId);
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState(doc.fileName);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await ordersAPI.fetchDocumentBlob(orderId, doc.id);
      downloadBlob(blob, doc.fileName);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/30 px-3 py-2.5">
      <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{doc.fileName}</p>
        <p className="text-[11px] text-muted-foreground">
          {doc.kind.replace(/_/g, ' ')} · {formatBytes(doc.fileSizeBytes)}
          {doc.uploadedBy
            ? ` · ${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}`
            : ''}{' '}
          · {formatDateTime(doc.createdAt)}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label="Preview document"
          onClick={() => onPreview(doc)}
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label="Download document"
          disabled={downloading}
          onClick={handleDownload}
        >
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        </Button>
        {canWrite && (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              aria-label="Rename document"
              onClick={() => {
                setName(doc.fileName);
                setRenameOpen(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive hover:text-destructive"
              aria-label="Delete document"
              disabled={loading}
              onClick={async () => {
                try {
                  await remove(doc.id);
                  onDeleted?.(doc.id);
                  toast.success('Document removed');
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Failed to delete');
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
          </DialogHeader>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={renaming || !name.trim() || name.trim() === doc.fileName}
              onClick={async () => {
                const nextName = name.trim();
                // Close before the mutation so Radix cannot leave body scroll-lock
                // stuck if the row unmounts mid-invalidate.
                setRenameOpen(false);
                try {
                  await rename(doc.id, nextName);
                  toast.success('Document renamed');
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Rename failed');
                }
              }}
            >
              {renaming ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DropZone({
  label,
  accept,
  multiple,
  disabled,
  onFiles,
}: {
  label: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: FileList) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={cn(
        'rounded-lg border border-dashed px-4 py-6 text-center transition-colors',
        dragOver ? 'border-brand bg-brand/5' : 'border-border/80 bg-muted/20',
        disabled && 'pointer-events-none opacity-50',
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple={multiple}
        onChange={(e) => e.target.files && onFiles(e.target.files)}
      />
      <Upload className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">Drag & drop or click to browse</p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-3"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Choose files
      </Button>
    </div>
  );
}

function AuthenticatedPreview({
  orderId,
  doc,
}: {
  orderId: string;
  doc: OrderDocument;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const blob = await ordersAPI.fetchDocumentBlob(orderId, doc.id);
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setUrl(objectUrl);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load preview');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [orderId, doc.id]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading preview…
      </div>
    );
  }

  if (error || !url) {
    return <p className="text-sm text-destructive">{error ?? 'Preview unavailable'}</p>;
  }

  if (doc.mimeType.startsWith('image/')) {
    return <img src={url} alt={doc.fileName} className="mx-auto max-h-[65vh] rounded-md" />;
  }

  if (doc.mimeType === 'application/pdf') {
    return (
      <iframe
        title={doc.fileName}
        src={url}
        className="h-[65vh] w-full rounded-md border border-border"
      />
    );
  }

  return (
    <p className="text-sm text-muted-foreground">Preview not available — use download instead.</p>
  );
}

interface OrderDocumentsPanelProps {
  orderId: string;
  canWrite: boolean;
  invoice?: Invoice | null;
  canViewInvoices?: boolean;
}

export function OrderDocumentsPanel({
  orderId,
  canWrite,
  invoice,
  canViewInvoices,
}: OrderDocumentsPanelProps) {
  const { data: currentUser } = useCurrentUser();
  /// Printing needs the full company identity, not the session's org summary.
  const { data: organization } = useOrganizationQuery();
  const { data: documents, loading, error, refetch } = useOrderDocuments(orderId);
  const { upload, loading: uploading } = useUploadOrderDocument(orderId);
  const [previewDoc, setPreviewDoc] = useState<OrderDocument | null>(null);
  const [invoiceSheetId, setInvoiceSheetId] = useState<string | null>(null);
  const fullInvoiceQuery = useInvoiceQuery(invoice?.id ?? '');
  const printableInvoice = fullInvoiceQuery.data ?? invoice ?? null;

  const pods = documents.filter((d) => d.kind === 'POD');
  const attachments = documents.filter((d) => d.kind === 'ATTACHMENT' || d.kind === 'OTHER');

  const handleUpload = useCallback(
    async (files: FileList, kind: OrderDocumentKind) => {
      const list = Array.from(files);
      try {
        for (const file of list) {
          await upload(file, kind);
        }
        toast.success(list.length === 1 ? 'Document uploaded' : `${list.length} documents uploaded`);
        refetch();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Upload failed');
      }
    },
    [upload, refetch],
  );

  const printInvoice = () => {
    if (!printableInvoice) return;
    printInvoiceDocument({ invoice: printableInvoice, organization });
  };

  return (
    <div className="space-y-4">
      {canViewInvoices && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            Invoice
          </div>
          {invoice ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-background/30 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-semibold">{invoice.invoiceNumber}</p>
                <p className="text-xs text-muted-foreground">
                  {invoice.status.replace(/_/g, ' ')} · {formatMoney(invoice.totalAmount, invoice.currency)}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setInvoiceSheetId(invoice.id)}>
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                Preview
              </Button>
              <Button size="sm" variant="outline" onClick={printInvoice} disabled={!printableInvoice}>
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print / PDF
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No invoice linked to this order yet.</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Proof of delivery
          </div>
          {pods.length > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {pods.length} file{pods.length === 1 ? '' : 's'}
            </Badge>
          )}
        </div>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            {pods.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                orderId={orderId}
                canWrite={canWrite}
                onPreview={setPreviewDoc}
                onDeleted={(id) => {
                  setPreviewDoc((prev) => (prev?.id === id ? null : prev));
                }}
              />
            ))}
            {pods.length === 0 &&
              (canWrite ? (
                <DropZone
                  label="Upload POD"
                  accept="application/pdf,image/*"
                  disabled={uploading}
                  onFiles={(files) => handleUpload(files, 'POD')}
                />
              ) : (
                <p className="text-sm text-muted-foreground">No proof of delivery on file yet.</p>
              ))}
          </>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Attachments
        </div>
        {loading ? (
          <Skeleton className="h-14 w-full rounded-lg" />
        ) : error ? (
          <p className="text-sm text-muted-foreground">Unable to load attachments.</p>
        ) : (
          attachments.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              orderId={orderId}
              canWrite={canWrite}
              onPreview={setPreviewDoc}
              onDeleted={(id) => {
                setPreviewDoc((prev) => (prev?.id === id ? null : prev));
              }}
            />
          ))
        )}
        {!loading && !error && canWrite && (
          <DropZone
            label="Add attachments"
            multiple
            disabled={uploading}
            onFiles={(files) => handleUpload(files, 'ATTACHMENT')}
          />
        )}
      </div>

      <Dialog open={Boolean(previewDoc)} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{previewDoc?.fileName}</DialogTitle>
          </DialogHeader>
          {previewDoc && <AuthenticatedPreview orderId={orderId} doc={previewDoc} />}
        </DialogContent>
      </Dialog>

      {canViewInvoices && (
        <InvoiceDetailSheet
          invoiceId={invoiceSheetId}
          onOpenChange={(open) => {
            if (!open) setInvoiceSheetId(null);
          }}
        />
      )}
    </div>
  );
}
