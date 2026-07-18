import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import {
  planPriceMajor,
  useCreateSubscriptionMutation,
  type Plan,
} from "@/lib/api/billing";

/// Create-subscription flow, shown when the org has no subscription yet. Reuses
/// the shared Dialog + Select + form controls — no bespoke modal.
export function CreateSubscriptionDialog({ plans, trigger }: { plans: Plan[]; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState<string>("");
  const [trialDays, setTrialDays] = useState<string>("");
  const [seats, setSeats] = useState<string>("");

  const { mutateAsync, isPending } = useCreateSubscriptionMutation();

  const reset = () => {
    setPlanId("");
    setTrialDays("");
    setSeats("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planId) return;
    try {
      await mutateAsync({
        planId,
        trialDays: trialDays ? Number(trialDays) : undefined,
        seats: seats ? Number(seats) : undefined,
      });
      toast.success("Subscription created");
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create subscription");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a subscription</DialogTitle>
          <DialogDescription>Choose a plan for this organization. You can change it later.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="plan">Plan</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger id="plan">
                <SelectValue placeholder="Select a plan" />
              </SelectTrigger>
              <SelectContent>
                {plans
                  .filter((p) => p.isActive !== false)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {formatMoney(planPriceMajor(p.price), p.currency)}/mo
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="trial">Trial days (optional)</Label>
              <Input
                id="trial"
                type="number"
                min={1}
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
                placeholder="e.g. 14"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seats">Seats (optional)</Label>
              <Input
                id="seats"
                type="number"
                min={1}
                value={seats}
                onChange={(e) => setSeats(e.target.value)}
                placeholder="e.g. 10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!planId || isPending}>
              {isPending ? "Creating…" : "Create subscription"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
