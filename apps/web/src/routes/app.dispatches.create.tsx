import { createFileRoute, redirect } from "@tanstack/react-router";

/// The full-page create form is gone — dispatch creation is a right-side sheet on
/// the list (`DispatchesCreateSheet`). Deep links to /app/dispatches/create still
/// work (including ?orderId=) — they land on the list with the sheet open.
export const Route = createFileRoute("/app/dispatches/create")({
  head: () => ({
    meta: [{ title: "New Dispatch — FlowERP AI" }],
  }),
  validateSearch: (search: Record<string, unknown>): { orderId?: string } => ({
    orderId: typeof search.orderId === "string" ? search.orderId : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/app/dispatches",
      search: {
        create: true,
        ...(search.orderId ? { orderId: search.orderId } : {}),
      } as const,
    });
  },
});
