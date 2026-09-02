import { createFileRoute, redirect } from "@tanstack/react-router";

/// `/login` is the canonical sign-in URL. This path stays alive because it is
/// what shipped: bookmarks, saved passwords in browser vaults, and any link
/// already sent to a customer point here. It carries `?redirect=` through so a
/// deep link that went through the old URL still lands where it was going.
export const Route = createFileRoute("/auth/sign-in")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/login", search, replace: true });
  },
});
