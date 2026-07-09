import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/fetch";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

export function openDemoModal() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("flowerp:open-demo"));
  }
}

export function DemoModal() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("flowerp:open-demo", handler);
    return () => window.removeEventListener("flowerp:open-demo", handler);
  }, []);

  /// Posts to the public POST /leads endpoint. This form used to sleep 700ms
  /// and claim "Demo request received" without sending anything anywhere — the
  /// visitor got a confirmation and nobody got the lead.
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = e.currentTarget;
    const data = new FormData(form);

    try {
      const response = await apiFetch("/api/leads", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({
          name: String(data.get("name") ?? ""),
          email: String(data.get("email") ?? ""),
          company: String(data.get("company") ?? ""),
          phone: String(data.get("phone") ?? ""),
          message: String(data.get("message") ?? "") || undefined,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message =
          response.status === 429
            ? "Too many requests. Please try again in a minute."
            : body?.error?.message ?? body?.message ?? "Could not send your request. Please try again.";
        throw new Error(Array.isArray(message) ? message[0] : message);
      }

      form.reset();
      setOpen(false);
      toast.success("Demo request received", {
        description: "We'll contact you within one business day.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogContent className="max-w-lg border-border/60 bg-surface p-0 sm:rounded-2xl">
        <div className="p-8">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="font-display text-2xl font-bold tracking-tight">
              Request a Personalized Demo
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              See how FlowERP AI can fit your logistics workflow.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="d-name">Full Name</Label>
              <Input id="d-name" name="name" required maxLength={200} placeholder="Jane Doe" className="h-11 bg-background/40" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="d-email">Work Email</Label>
              <Input id="d-email" name="email" type="email" required maxLength={320} placeholder="jane@company.com" className="h-11 bg-background/40" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="d-company">Company Name</Label>
              <Input id="d-company" name="company" required maxLength={200} placeholder="Acme Logistics" className="h-11 bg-background/40" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="d-phone">Phone / WhatsApp</Label>
              <Input id="d-phone" name="phone" required maxLength={50} placeholder="+998 50 108 18 24" className="h-11 bg-background/40" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="d-msg" className="text-muted-foreground">
                Message <span className="text-xs">(optional)</span>
              </Label>
              <Textarea
                id="d-msg"
                name="message"
                rows={3}
                maxLength={2000}
                placeholder="Tell us about your fleet size or workflow…"
                className="bg-background/40"
              />
            </div>

            <Button type="submit" disabled={submitting} className="h-11 w-full bg-gradient-brand text-brand-foreground hover:opacity-90">
              {submitting ? "Sending…" : "Request My Demo"}
            </Button>

            <div className="flex items-center justify-center gap-2 pt-1 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              We'll contact you within one business day.
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
