import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/AuthShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/reset-password")({
  head: () => ({ meta: [{ title: "Reset Password — FlowERP AI" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 500));
    toast.success("Password updated");
    navigate({ to: "/auth/sign-in" });
  };

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose a strong password you haven't used before."
      footer={
        <Link to="/auth/sign-in" className="font-medium text-brand hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="password">New Password</Label>
          <Input id="password" type="password" required placeholder="At least 8 characters" className="h-11 bg-background/40" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <Input id="confirm" type="password" required placeholder="Repeat password" className="h-11 bg-background/40" />
        </div>
        <Button type="submit" disabled={loading} className="h-11 w-full bg-gradient-brand text-brand-foreground hover:opacity-90">
          {loading ? "Updating…" : "Update Password"}
        </Button>
      </form>
    </AuthShell>
  );
}
