import { useQuery } from '@tanstack/react-query';
import { portalFetch } from './portal-fetch';
import { unwrapResponse as unwrap } from './error';
import { portalDocumentKeys } from './portal-query-keys';
import { describeError } from './describe-error';

export interface PortalDocument {
  id: string;
  type: 'POD' | 'INVOICE';
  title: string;
  entityId: string;
  createdAt: string;
  downloadUrl: string;
}

export interface ListPortalDocumentsResponse {
  items: PortalDocument[];
}

class PortalDocumentsAPI {
  private baseUrl = '/api/customer-portal/documents';

  async list(): Promise<ListPortalDocumentsResponse> {
    const response = await portalFetch(this.baseUrl, { method: 'GET' });
    return unwrap(response, 'Failed to fetch documents');
  }
}

export const portalDocumentsAPI = new PortalDocumentsAPI();

export function usePortalDocuments() {
  const result = useQuery({
    queryKey: portalDocumentKeys.list(),
    queryFn: () => portalDocumentsAPI.list(),
  });

  return {
    data: result.data?.items ?? [],
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to load documents') : null,
    refetch: result.refetch,
  };
}
