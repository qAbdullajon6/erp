import { createFileRoute, redirect } from "@tanstack/react-router";

/// The full-page create form is gone — order creation is a right-side sheet on
/// the list (`OrdersCreateSheet`). Deep links to /app/orders/create still work:
/// they land on the list with the sheet open.
export const Route = createFileRoute("/app/orders/create")({
  head: () => ({
    meta: [{ title: "New Order — FlowERP AI" }],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/app/orders", search: { create: true } as const });
  },
});
