'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { deliveryProofsAPI, type DeliveryProofType } from '@/lib/api/delivery-proofs';
import { describeError } from '@/lib/api/describe-error';
import { useInvalidateOperationalState } from '@/lib/api/invalidate';
import { deliveryProofKeys } from '@/lib/api/query-keys';

export function useDeliveryProofs(dispatchId: string, type?: DeliveryProofType) {
  const result = useQuery({
    queryKey: deliveryProofKeys.list(dispatchId),
    queryFn: () => deliveryProofsAPI.list(dispatchId, type),
    enabled: Boolean(dispatchId),
  });

  return {
    data: result.data?.items ?? [],
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to fetch proofs') : null,
    refetch: result.refetch,
  };
}

export function useUploadPhotos(dispatchId: string) {
  const invalidate = useInvalidateOperationalState();
  const mutation = useMutation({
    mutationFn: (files: File[]) => deliveryProofsAPI.uploadPhotos(dispatchId, files),
    onSuccess: invalidate,
  });

  return {
    upload: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to upload photos') : null,
  };
}

export function useUploadSignature(dispatchId: string) {
  const invalidate = useInvalidateOperationalState();
  const mutation = useMutation({
    mutationFn: (file: File) => deliveryProofsAPI.uploadSignature(dispatchId, file),
    onSuccess: invalidate,
  });

  return {
    upload: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to upload signature') : null,
  };
}

export function useDeleteDeliveryProof(dispatchId: string) {
  const invalidate = useInvalidateOperationalState();
  const mutation = useMutation({
    mutationFn: (proofId: string) => deliveryProofsAPI.delete(dispatchId, proofId),
    onSuccess: invalidate,
  });

  return {
    remove: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to delete proof') : null,
  };
}

export function useUpdateDeliveryNotes(dispatchId: string) {
  const invalidate = useInvalidateOperationalState();
  const mutation = useMutation({
    mutationFn: (deliveryNotes: string) =>
      deliveryProofsAPI.updateDeliveryNotes(dispatchId, deliveryNotes),
    onSuccess: invalidate,
  });

  return {
    update: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to update delivery notes') : null,
  };
}
