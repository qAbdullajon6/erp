import { QueryClient } from '@tanstack/react-query';
import { isClientError } from './error';

/** Standard exponential backoff, capped — 1s, 2s, doubling up to 30s. TanStack
 * Query's own default is exactly this, made explicit here so it reads as a
 * deliberate choice (matching services/offline/offline-queue.ts's own backoff)
 * rather than an unstated library default. */
function retryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 30_000);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 4xx is the server's considered answer — retrying resends the same
      // request for the same refusal. Only network blips and 5xx are worth a
      // second try.
      retry: (failureCount, error) => !isClientError(error) && failureCount < 3,
      retryDelay,
      staleTime: 30_000,
      // onlineManager (providers/query-provider.tsx) already pauses queries
      // while offline; this just makes sure a query that was ALREADY in flight
      // when the connection dropped doesn't sit there burning through retries
      // against a dead socket instead of pausing too.
      networkMode: 'offlineFirst',
    },
    mutations: {
      // Status-update mutations are NOT retried automatically here — a failed
      // one is handed to services/offline/offline-queue.ts instead, which
      // retries deliberately and shows the driver a pending-sync state rather
      // than silently redoing a mutation in the background.
      retry: false,
      networkMode: 'offlineFirst',
    },
  },
});
