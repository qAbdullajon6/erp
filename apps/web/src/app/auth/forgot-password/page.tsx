"use client";

import * as React from "react";
import Link from "next/link";
import { MailWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/// There is no POST /auth/forgot-password (or any password-reset-by-email
/// endpoint) anywhere in apps/api — this project has no email delivery
/// configured at all yet. This page deliberately never claims to have sent
/// anything; it only ever shows the honest "not configured" state below,
/// regardless of what's typed in. See docs/CONNECTED_MODE_AUTH_UI.md.
export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);

  return (
    <Card className="w-full max-w-md">
      <CardContent className="space-y-5 py-7">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Reset your password</h1>
          <p className="text-sm text-muted-foreground">
            Request a password reset link by email.
          </p>
        </div>

        {!submitted ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(true);
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full">
              Continue
            </Button>
          </form>
        ) : (
          <div className="space-y-3 rounded-md border border-dashed border-muted-foreground/30 bg-muted/40 p-4">
            <div className="flex items-start gap-2">
              <MailWarning className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="space-y-1.5 text-sm">
                <p className="font-medium">Email delivery is not configured in local development</p>
                <p className="text-muted-foreground">
                  FlowERP AI&apos;s backend has no password-reset-by-email flow implemented yet — no
                  message was sent to {email || "that address"}. This page is a UI placeholder for a
                  future phase; it never pretends an email went out.
                </p>
                <p className="text-muted-foreground">
                  If you still remember your password, sign back in and use Change Password from
                  your account menu instead.
                </p>
              </div>
            </div>
          </div>
        )}

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/auth/login" className="underline underline-offset-2">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
