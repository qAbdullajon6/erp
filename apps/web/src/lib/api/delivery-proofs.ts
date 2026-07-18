import { apiFetch } from './fetch';
import { unwrapResponse } from './error';

export type DeliveryProofType = 'PHOTO' | 'SIGNATURE';

export interface DeliveryProof {
  id: string;
  organizationId: string;
  dispatchId: string;
  orderId: string | null;
  uploadedBy: string;
  type: DeliveryProofType;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storageKey: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  uploader?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface ListProofsResponse {
  items: DeliveryProof[];
}

class DeliveryProofsAPI {
  async list(dispatchId: string, type?: DeliveryProofType): Promise<ListProofsResponse> {
    const query = type ? `?type=${type}` : '';
    const response = await apiFetch(
      `/api/dispatches/${dispatchId}/proofs${query}`,
      { method: 'GET' },
    );
    return unwrapResponse(response, 'Failed to fetch delivery proofs');
  }

  async uploadPhotos(dispatchId: string, files: File[]): Promise<DeliveryProof[]> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    const response = await apiFetch(`/api/dispatches/${dispatchId}/proofs/photo`, {
      method: 'POST',
      body: formData,
    });
    return unwrapResponse(response, 'Failed to upload photos');
  }

  async uploadSignature(dispatchId: string, file: File): Promise<DeliveryProof> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiFetch(`/api/dispatches/${dispatchId}/proofs/signature`, {
      method: 'POST',
      body: formData,
    });
    return unwrapResponse(response, 'Failed to upload signature');
  }

  async delete(dispatchId: string, proofId: string): Promise<void> {
    const response = await apiFetch(
      `/api/dispatches/${dispatchId}/proofs/${proofId}`,
      { method: 'DELETE' },
    );
    await unwrapResponse(response, 'Failed to delete delivery proof');
  }

  getFileUrl(dispatchId: string, proofId: string): string {
    return `/api/dispatches/${dispatchId}/proofs/${proofId}/file`;
  }

  async updateDeliveryNotes(dispatchId: string, deliveryNotes: string): Promise<void> {
    const response = await apiFetch(`/api/dispatches/${dispatchId}/delivery-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deliveryNotes }),
    });
    await unwrapResponse(response, 'Failed to update delivery notes');
  }
}

export const deliveryProofsAPI = new DeliveryProofsAPI();
