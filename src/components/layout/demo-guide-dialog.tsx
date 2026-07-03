"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Check, Compass, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { demoGuideSteps, useDemoGuide } from "@/lib/demo-guide";
import { useAppData } from "@/lib/store";
import { useRole } from "@/lib/role";

export function DemoGuideDialog() {
  const [open, setOpen] = React.useState(false);
  const [confirmingReset, setConfirmingReset] = React.useState(false);
  const { completed, toggleStep } = useDemoGuide();
  const { resetDemoData } = useAppData();
  const { setRole } = useRole();

  const completedCount = demoGuideSteps.filter((s) => completed.has(s.id)).length;

  function handleReset() {
    resetDemoData();
    setRole("admin");
    setConfirmingReset(false);
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmingReset(false);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="hidden gap-1.5 sm:flex">
          <Compass className="size-3.5" />
          Demo Guide
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Demo Guide</DialogTitle>
          <DialogDescription>
            {completedCount} of {demoGuideSteps.length} steps reviewed — a suggested path through
            FlowERP AI for a live demo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          {demoGuideSteps.map((step, i) => {
            const done = completed.has(step.id);
            return (
              <div
                key={step.id}
                className="flex items-start gap-3 rounded-lg border border-border p-3"
              >
                <button
                  type="button"
                  onClick={() => toggleStep(step.id)}
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium transition-colors",
                    done
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground",
                  )}
                  aria-label={done ? "Mark step as not reviewed" : "Mark step as reviewed"}
                >
                  {done ? <Check className="size-3" /> : i + 1}
                </button>
                <div className="min-w-0 flex-1">
                  <Link
                    href={step.href}
                    onClick={() => setOpen(false)}
                    className="text-sm font-medium hover:underline"
                  >
                    {step.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {confirmingReset ? (
          <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="flex items-start gap-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              This will erase every change you&apos;ve made in this demo (orders, payments,
              customers, roles) and restore the original sample data. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={handleReset}>
                Yes, reset all demo data
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmingReset(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <DialogFooter className="items-center sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-muted-foreground"
              onClick={() => setConfirmingReset(true)}
            >
              <RotateCcw className="size-3.5" />
              Reset demo data
            </Button>
            <Button asChild onClick={() => setOpen(false)}>
              <Link href={demoGuideSteps[0].href}>Start Guided Demo</Link>
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
