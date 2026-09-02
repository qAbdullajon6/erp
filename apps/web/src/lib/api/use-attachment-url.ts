import { useEffect, useState } from 'react';
import { apiFetch } from './fetch';

/**
 * Fetches an API-protected attachment URL using the session token and returns
 * a local blob URL that the browser can display without auth headers.
 * The blob URL is revoked on unmount.
 */
export function useAttachmentUrl(apiUrl: string | null): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!apiUrl) return;
    let objectUrl: string | null = null;
    let cancelled = false;

    apiFetch(apiUrl)
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => { /* silently ignore network / auth errors */ });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setBlobUrl(null);
    };
  }, [apiUrl]);

  return blobUrl;
}
