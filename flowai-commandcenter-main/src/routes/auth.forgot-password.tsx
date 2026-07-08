import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/AuthShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/forgot-password")({
  head: () => ({ meta: [{ title: "Forgot Password — FlowERP AI" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 500));
    setLoading(false);
    setSent(true);
    toast.success("Reset link sent");
  };

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a reset link."
      footer={
        <>
          Remembered it?{" "}
          <Link to="/auth/sign-in" className="font-medium text-brand hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="rounded-xl border border-border/60 bg-background/40 p-4 text-center text-sm text-muted-foreground">
          If an account exists for that email, a reset link is on its way.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Work Email</Label>
            <Input id="email" type="email" required placeholder="you@company.com" className="h-11 bg-background/40" />
          </div>
          <Button type="submit" disabled={loading} className="h-11 w-full bg-gradient-brand text-brand-foreground hover:opacity-90">
            {loading ? "Sending…" : "Send Reset Link"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
