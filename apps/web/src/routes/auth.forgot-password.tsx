import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/site/landing/primitives";
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

function ForgotPasswordPage() {
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
      <div className="space-y-5">
        <div className="flex items-start gap-3.5 rounded-xl border border-border/60 bg-background/40 p-4 transition-colors hover:border-border">
          <IconTile size="sm" className="shrink-0">
            <ShieldCheck className="h-4 w-4" />
          </IconTile>
          <div className="text-sm">
            <p className="font-medium text-foreground">Ask your organization admin</p>
            <p className="mt-1 leading-relaxed text-muted-foreground">
              Any admin on your FlowERP organization can restore your access from Settings → Members.
              This is the fastest route.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3.5 rounded-xl border border-border/60 bg-background/40 p-4 transition-colors hover:border-border">
          <IconTile size="sm" className="shrink-0">
            <Mail className="h-4 w-4" />
          </IconTile>
          <div className="text-sm">
            <p className="font-medium text-foreground">Contact FlowERP support</p>
            <p className="mt-1 leading-relaxed text-muted-foreground">
              If you are the only admin, or you cannot reach one, email us and we will verify you and
              reset the account.
            </p>
          </div>
        </div>

        <Button
          asChild
          className="h-11 w-full rounded-xl bg-gradient-brand text-[15px] font-semibold text-brand-foreground transition-all duration-200 hover:opacity-90 hover:shadow-brand active:scale-[0.99]"
        >
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
