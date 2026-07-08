import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/AuthShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/create-account")({
  head: () => ({ meta: [{ title: "Create Account — FlowERP AI" }] }),
  component: CreateAccountPage,
});

function CreateAccountPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    toast.success("Account created", { description: "Check your email to verify." });
    navigate({ to: "/auth/verify-email" });
  };

  return (
    <AuthShell
      title="Create your FlowERP AI account"
      subtitle="Set up your workspace in less than a minute."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/auth/sign-in" className="font-medium text-brand hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="name">Full Name</Label>
          <Input id="name" required placeholder="Jane Doe" className="h-11 bg-background/40" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="company">Company</Label>
          <Input id="company" required placeholder="Acme Logistics" className="h-11 bg-background/40" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Work Email</Label>
          <Input id="email" type="email" required placeholder="you@company.com" className="h-11 bg-background/40" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" required placeholder="At least 8 characters" className="h-11 bg-background/40" />
        </div>
        <Button type="submit" disabled={loading} className="h-11 w-full bg-gradient-brand text-brand-foreground hover:opacity-90">
          {loading ? "Creating…" : "Create Account"}
        </Button>
      </form>
    </AuthShell>
  );
}
