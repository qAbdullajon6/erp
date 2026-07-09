import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/auth/forgot-password")({
  head: () => ({ meta: [{ title: "Forgot Password — FlowERP AI" }] }),
  component: ForgotPasswordPage,
});

/// This page previously showed an email field, slept 500ms, and announced
/// "Reset link sent" — no email was ever sent, because the API has no
/// password-reset endpoint and no mail provider is configured. Rather than lie
/// to a locked-out user, it now tells them the two routes that actually work:
/// their organization admin, or FlowERP support.
const SUPPORT_EMAIL = "hello@itechnology.uz";

export function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Password resets are handled by a person, not a link."
      footer={
        <>
          Remembered it?{" "}
          <Link to="/auth/sign-in" className="font-medium text-brand hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/40 p-4">
          <span className="mt-0.5 shrink-0 rounded-lg bg-brand/10 p-2 text-brand">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="text-sm">
            <p className="font-medium text-foreground">Ask your organization admin</p>
            <p className="mt-1 text-muted-foreground">
              Any admin on your FlowERP organization can restore your access from Settings → Members.
              This is the fastest route.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/40 p-4">
          <span className="mt-0.5 shrink-0 rounded-lg bg-brand/10 p-2 text-brand">
            <Mail className="h-4 w-4" />
          </span>
          <div className="text-sm">
            <p className="font-medium text-foreground">Contact FlowERP support</p>
            <p className="mt-1 text-muted-foreground">
              If you are the only admin, or you cannot reach one, email us and we will verify you and
              reset the account.
            </p>
          </div>
        </div>

        <Button asChild className="h-11 w-full bg-gradient-brand text-brand-foreground hover:opacity-90">
          <a href={`mailto:${SUPPORT_EMAIL}?subject=FlowERP%20password%20reset`}>
            Email {SUPPORT_EMAIL}
          </a>
        </Button>

        <p className="flex items-center justify-center gap-2 pt-1 text-xs text-muted-foreground">
          <KeyRound className="h-3.5 w-3.5" />
          Already signed in? Change your password from Settings.
        </p>
      </div>
    </AuthShell>
  );
}
