import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/verify-email")({
  head: () => ({ meta: [{ title: "Verify Email — FlowERP AI" }] }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  return (
    <AuthShell
      title="Verify your email"
      subtitle="We've sent a verification link to your inbox. Click it to activate your account."
      footer={
        <Link to="/auth/sign-in" className="font-medium text-brand hover:underline">
          Back to sign in
        </Link>
      }
    >
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-brand/15 text-brand">
          <MailCheck className="h-7 w-7" />
        </div>
        <p className="text-sm text-muted-foreground">
          Didn't receive it? Check your spam folder or resend the email.
        </p>
        <Button
          onClick={() => toast.success("Verification email resent")}
          variant="outline"
          className="h-11 w-full border-border/60 bg-background/40"
        >
          Resend Verification Email
        </Button>
      </div>
    </AuthShell>
  );
}
