'use client';

import { useState, useRef, useCallback } from 'react';
import {
  useDeliveryProofs,
  useUploadPhotos,
  useUploadSignature,
  useDeleteDeliveryProof,
  useUpdateDeliveryNotes,
} from '@/lib/hooks/use-delivery-proofs';
import { deliveryProofsAPI, type DeliveryProof } from '@/lib/api/delivery-proofs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { SignaturePad } from './signature-pad';
import { Camera, Upload, Trash2, FileImage, PenTool, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { describeError } from '@/lib/api/describe-error';

interface DeliveryProofPanelProps {
  dispatchId: string;
  deliveryNotes?: string;
  deliveryProofCount?: number;
  isTerminal?: boolean;
}

const ACCEPTED_PHOTO_TYPES = 'image/jpeg,image/png,image/webp,image/heic';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ProofItem({
  proof,
  dispatchId,
  onDelete,
  deleting,
  isTerminal,
}: {
  proof: DeliveryProof;
  dispatchId: string;
  onDelete: (id: string) => void;
  deleting: boolean;
  isTerminal: boolean;
}) {
  const fileUrl = deliveryProofsAPI.getFileUrl(dispatchId, proof.id);

  return (
    <div className="flex items-start gap-3 rounded-md border border-border p-3">
      <div className="flex-shrink-0">
        {proof.type === 'PHOTO' ? (
          <img
            src={fileUrl}
            alt={proof.fileName}
            className="h-20 w-20 rounded object-cover"
          />
        ) : (
          <img
            src={fileUrl}
            alt="Signature"
            className="h-20 w-40 rounded border border-border bg-white object-contain p-1"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant={proof.type === 'PHOTO' ? 'default' : 'secondary'}>
            {proof.type === 'PHOTO' ? (
              <FileImage className="mr-1 h-3 w-3" />
            ) : (
              <PenTool className="mr-1 h-3 w-3" />
            )}
            {proof.type}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatFileSize(proof.fileSize)}
          </span>
        </div>
        <p className="mt-1 truncate text-sm text-muted-foreground">{proof.fileName}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(proof.createdAt).toLocaleString()}
          {proof.uploader && ` by ${proof.uploader.firstName} ${proof.uploader.lastName}`}
        </p>
      </div>
      {!isTerminal && (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive h-8 w-8 p-0">
              <Trash2 className="h-4 w-4" />
            </Button>
          }
          title="Delete this proof?"
          description="This file will be permanently removed."
          confirmLabel="Delete"
          onConfirm={() => onDelete(proof.id)}
          destructive
        />
      )}
    </div>
  );
}

export function DeliveryProofPanel({
  dispatchId,
  deliveryNotes: initialNotes,
  deliveryProofCount = 0,
  isTerminal = false,
}: DeliveryProofPanelProps) {
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: proofs, loading: loadingProofs } = useDeliveryProofs(dispatchId);
  const { upload: uploadPhotos, loading: uploadingPhotos } = useUploadPhotos(dispatchId);
  const { upload: uploadSignature, loading: uploadingSignature } = useUploadSignature(dispatchId);
  const { remove: deleteProof, loading: deleting } = useDeleteDeliveryProof(dispatchId);
  const { update: updateNotes, loading: updatingNotes } = useUpdateDeliveryNotes(dispatchId);

  const handlePhotoUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      try {
        const fileArray = Array.from(files);
        await uploadPhotos(fileArray);
        toast.success(`${fileArray.length} photo(s) uploaded`);
      } catch (err) {
        toast.error(describeError(err, 'Failed to upload photos'));
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [uploadPhotos],
  );

  const handleSignatureCapture = useCallback(
    async (blob: Blob) => {
      try {
        const file = new File([blob], `signature-${Date.now()}.png`, { type: 'image/png' });
        await uploadSignature(file);
        toast.success('Signature saved');
        setShowSignaturePad(false);
      } catch (err) {
        toast.error(describeError(err, 'Failed to upload signature'));
      }
    },
    [uploadSignature],
  );

  const handleDelete = useCallback(
    async (proofId: string) => {
      try {
        await deleteProof(proofId);
        toast.success('Proof deleted');
      } catch (err) {
        toast.error(describeError(err, 'Failed to delete proof'));
      }
    },
    [deleteProof],
  );

  const handleSaveNotes = useCallback(async () => {
    try {
      await updateNotes(notes);
      toast.success('Delivery notes saved');
    } catch (err) {
      toast.error(describeError(err, 'Failed to save delivery notes'));
    }
  }, [notes, updateNotes]);

  const photos = proofs.filter((p) => p.type === 'PHOTO');
  const signatures = proofs.filter((p) => p.type === 'SIGNATURE');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Proof of Delivery
            {deliveryProofCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {deliveryProofCount}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isTerminal && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhotos}
                className="gap-1"
              >
                <Upload className="h-3.5 w-3.5" />
                {uploadingPhotos ? 'Uploading...' : 'Upload Photos'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_PHOTO_TYPES}
                multiple
                className="hidden"
                onChange={handlePhotoUpload}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSignaturePad(!showSignaturePad)}
                disabled={uploadingSignature}
                className="gap-1"
              >
                <PenTool className="h-3.5 w-3.5" />
                {showSignaturePad ? 'Cancel Signature' : 'Add Signature'}
              </Button>
            </div>
          )}

          {showSignaturePad && (
            <SignaturePad
              onCapture={handleSignatureCapture}
              disabled={uploadingSignature}
            />
          )}

          {loadingProofs ? (
            <p className="text-sm text-muted-foreground">Loading proofs...</p>
          ) : proofs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No delivery evidence uploaded yet. {isTerminal ? '' : 'Upload photos or add a signature to complete delivery.'}
            </p>
          ) : (
            <div className="space-y-4">
              {photos.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Photos ({photos.length})</h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {photos.map((proof) => (
                      <ProofItem
                        key={proof.id}
                        proof={proof}
                        dispatchId={dispatchId}
                        onDelete={handleDelete}
                        deleting={deleting}
                        isTerminal={isTerminal}
                      />
                    ))}
                  </div>
                </div>
              )}
              {signatures.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Signature</h4>
                  {signatures.map((proof) => (
                    <ProofItem
                      key={proof.id}
                      proof={proof}
                      dispatchId={dispatchId}
                      onDelete={handleDelete}
                      deleting={deleting}
                      isTerminal={isTerminal}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <StickyNote className="h-5 w-5" />
            Delivery Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add delivery notes (optional)..."
            rows={3}
            disabled={isTerminal}
          />
          {!isTerminal && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveNotes}
              disabled={updatingNotes}
            >
              {updatingNotes ? 'Saving...' : 'Save Notes'}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function isTerminalStatus(status: string): boolean {
  return status === 'DELIVERED' || status === 'CANCELLED';
}
