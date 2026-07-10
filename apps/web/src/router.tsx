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
