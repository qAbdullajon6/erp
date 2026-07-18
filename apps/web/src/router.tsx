import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { isClientError } from "./lib/api/error";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        /// React Query retries three times by default, which turns a single
        /// 403 into four identical refusals and leaves the screen spinning for
        /// fifteen seconds before it admits anything is wrong. A 4xx is the
        /// server's considered answer; only 5xx and transport errors deserve
        /// another attempt.
        retry: (failureCount, error) => !isClientError(error) && failureCount < 2,

        /// Data stays trusted for 30 seconds. Navigating from the orders list into
        /// an order and straight back out therefore serves the list from cache
        /// instead of refetching it — the "flash of skeleton on the back button"
        /// that a staleTime of 0 gives you.
        ///
        /// This is safe precisely BECAUSE every mutation invalidates (Task 8.9): a
        /// stale window only matters for changes someone else made, and for the one
        /// query where that genuinely bites — availability — the hook overrides this
        /// back to 0 and refetches on focus.
        staleTime: 30_000,

        /// Keep an unmounted screen's data around for five minutes, so going back to
        /// it renders instantly from cache while any refetch happens behind the
        /// already-painted UI.
        gcTime: 5 * 60_000,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
