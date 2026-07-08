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

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("flowerp:open-demo", handler);
    return () => window.removeEventListener("flowerp:open-demo", handler);
  }, []);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 700));
    setSubmitting(false);
    setOpen(false);
    toast.success("Demo request received", {
      description: "We'll contact you within one business day.",
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            <div className="grid gap-2">
              <Label htmlFor="d-name">Full Name</Label>
              <Input id="d-name" required placeholder="Jane Doe" className="h-11 bg-background/40" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="d-email">Work Email</Label>
              <Input id="d-email" type="email" required placeholder="jane@company.com" className="h-11 bg-background/40" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="d-company">Company Name</Label>
              <Input id="d-company" required placeholder="Acme Logistics" className="h-11 bg-background/40" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="d-phone">Phone / WhatsApp</Label>
              <Input id="d-phone" required placeholder="+998 50 108 18 24" className="h-11 bg-background/40" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="d-msg" className="text-muted-foreground">
                Message <span className="text-xs">(optional)</span>
              </Label>
              <Textarea id="d-msg" rows={3} placeholder="Tell us about your fleet size or workflow…" className="bg-background/40" />
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
